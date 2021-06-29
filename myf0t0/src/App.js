import React from 'react';
import './index.css';
import Modal from 'react-bootstrap/Modal'
import Button from 'react-bootstrap/Button'
import Dropdown from 'react-bootstrap/Dropdown'
import DropdownButton from 'react-bootstrap/DropdownButton'
import ReactStars from 'react-stars'

var AWS = require('aws-sdk');
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");

var AmazonCognitoIdentity = require('amazon-cognito-auth-js');



// define the config for the Auth JS SDK
var authData = {
  ClientId: process.env.REACT_APP_COGNITO_CLIENT_ID,
  AppWebDomain: process.env.REACT_APP_COGNITO_APP_DOMAIN,
  TokenScopesArray: process.env.REACT_APP_COGNITO_SCOPES.split(","),
  RedirectUriSignIn: process.env.REACT_APP_COGNITO_SIGN_IN_REDIRECT_URI,
  RedirectUriSignOut: process.env.REACT_APP_COGNITO_SIGN_OUT_REDIRECT_URI,
  UserPoolId: process.env.REACT_APP_COGNITO_USER_POOL_ID
}

class Header extends React.Component {
  constructor(props){
    super(props);
  }

  handleNavClick=(view)=>{
    this.props.navHandler(view);
  }

  render() {
    return (<div className="header">
      <NavButton view="Photos" navClickHandler={this.handleNavClick} />
      <NavButton view="Galleries" navClickHandler={this.handleNavClick} />
      <NavButton view="Settings" navClickHandler={this.handleNavClick} />
    </div>);
  }
}

class NavButton extends React.Component {
  constructor(props){
    super(props);

    this.handleNav = this.handleNav.bind(this);
  }

  handleNav(e){
    this.props.navClickHandler(this.props.view)
  }

  render() {
    return (
      <span onClick={this.handleNav}> {this.props.view} </span>
    )
  }
}

class Content extends React.Component {
  constructor(props){
    super(props);
  }

  render(){
    return (
      <div className="content">
        {this.props.view === "Photos" && <PhotoFilterPane jwt={this.props.jwt}/>}
        {this.props.view === "Galleries" && <Galleries />}
        {this.props.view === "Settings" && <Settings />}
      </div>
  )
  }
}

class PhotoDetailModal extends React.Component{
  constructor(props){
    super(props);
  }

  render(){
    return (
      <Modal
      {...this.props}
      //size="lg"
      aria-labelledby="contained-modal-title-vcenter"
      dialogClassName="photo-modal"
      centered
    >
      <Modal.Body>
        <PhotoDetailSigner data={this.props.photo} />
        <PhotoDetailData data={this.props.photo} jwt={this.props.jwt} updateHandler={this.props.updateHandler}/>
      </Modal.Body>
      <Modal.Footer>
        <Button className="btn btn-secondary" onClick={this.props.onHide}>Close</Button>
      </Modal.Footer>
    </Modal>
  );
  }
}

class PhotoDetailData extends React.Component{
  constructor(props){
    super(props);
  }

  render() {
    const exif = this.props.data.exif;

    var photoName = ""
    if ("SK" in this.props.data){
      photoName = this.props.data.SK.split("_")[1];
    }
    console.debug(this.props.data);
    return(
      <div className="photo-data">
        { photoName && <h1> {photoName}</h1>}
        <PhotoRating data={this.props.data} jwt={this.props.jwt} updateHandler={this.props.updateHandler}/>
        { exif &&
          <PhotoExifData exif={exif} />
        }
      </div>
    )
  }

}

class PhotoRating extends React.Component{
  constructor(props){
    super(props);
    this.setRating = this.setRating.bind(this);
  }

  handleRatingClick = (rating) => {
      console.log(rating);
      console.log(this.props);
      this.setRating(rating);
  }

  async setRating(rating) {
    console.debug(this.props);
    if (this.props.jwt){
      const requestOptions = {
        mode: 'cors',
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.props.jwt
        }
      };
      console.debug(this.props);
      var url = new URL(process.env.REACT_APP_API_ENDPOINT + "/rating");
      const params = {"photo_id": this.props.data.SK, "rating": rating}
      url.search = new URLSearchParams(params).toString();
      fetch(url, requestOptions)
        .then(response => response.json())
        .then(data => {
          console.log(data)
          this.props.updateHandler(this.props.data.SK, "GSI1PK", rating)
        })
    }
  }

  render() {
    const current_rating = parseInt(this.props.data.GSI1PK);
    return(
      <ReactStars name="star-rating" count={5} onChange={this.handleRatingClick} size={30} half={false} value={current_rating}/>
    )
  }
}

class PhotoExifData extends React.Component{
  constructor(props){
    super(props);
  }

  formatExif(exif){
    var formatted_exif = {}
    if("ApertureValue" in exif){
      const regexpAperture = /\(([0-9]+)\, ([0-9]+)\)/;
      const match = exif["ApertureValue"].match(regexpAperture);
      formatted_exif["Aperture"] = (parseFloat(match[1])/parseFloat(match[2])).toFixed(2);
    }

    if("FNumber" in exif){
      const regexpFNumber= /\(([0-9]+)\, ([0-9]+)\)/;
      const match = exif["FNumber"].match(regexpFNumber);
      formatted_exif["FNumber"] = (parseFloat(match[1])/parseFloat(match[2])).toFixed(2);
    }

    if("ExposureTime" in exif){
      const regexpExposure= /\(([0-9]+)\, ([0-9]+)\)/;
      const match = exif["ExposureTime"].match(regexpExposure);
      //Get exposure time in ms
      const exposureTime = (parseFloat(match[1])/(parseFloat(match[2])*1000.0)).toFixed(0);
      formatted_exif["Exposure Time"] = `${exposureTime}ms`
    }

    if("ExifImageHeight" in exif){
      const height = exif["ExifImageHeight"];
      formatted_exif["Image Height"] = `${height}px`
    }

    if("ExifImageWidth" in exif){
      const width = exif["ExifImageWidth"];
      formatted_exif["Image Width"] = `${width}px`
    }

    if("DateTime" in exif){
      formatted_exif["Date Taken"] = exif["DateTime"]
    }

    if("Make" in exif){
      formatted_exif["Make"] = exif["Make"]
    }

    if("Model" in exif){
      formatted_exif["Model"] = exif["Model"]
    }

    return formatted_exif;

  }

  render(){
    const exif = this.formatExif(this.props.exif);
    if(exif){
      return(
        <div>
        {
          Object.keys(exif).map((key, i) => (

            <p key={i}>
              <span>{key}: {exif[key]}</span>
            </p>
          ))
        }
        </div>
      )
    }
    return(<div />);
  }

}

class PhotoDetailSigner extends React.Component{
  constructor(props){
    super(props);
    this.state = {};
  }

  componentDidMount () {
    //Extract the bucket and object key from the response
    const image_key_arr = this.props.data.GSI1SK.split("/", 1);
    const image_bucket = image_key_arr[0];
    const image_key = this.props.data.GSI1SK.slice(image_bucket.length + 1)

    /*
    Sign a URL for the thumbnail using the Role associated with our login so that we can
    access the private bucket.
    */
    const clientParams = {
      region: process.env.REACT_APP_AWS_REGION,
      credentials: AWS.config.credentials
    }
    const getObjectParams = {
      Bucket:image_bucket,
      Key: image_key
    }
    const client = new S3Client(clientParams);
    const command = new GetObjectCommand(getObjectParams);
    getSignedUrl(client, command, { expiresIn: 3600 })
    .then((url) => {
      this.setState({url: url});
    })
    .catch((err) => {
      console.log(err);
    });
  }

  render(){
    const url = this.state.url;
    if (url){
      return(<PhotoDetailImage url={url} />);
    } else {
      return null;
    }

  }
}

class PhotoDetailImage extends React.Component{
  constructor (props) {
    super(props);
  }

  render() {
    return (
        <img className="detail-photo" src={this.props.url} alt=""/>
    );
  }
}

class PhotoFlowData extends React.Component{
  constructor(props){
    super(props);
    console.debug("PhotoFlowData Constructor")
    this.getPhotoData = this.getPhotoData.bind(this)
    this.updatePhotoData = this.updatePhotoData.bind(this);
    this.state = {photos: [], fetching_data: false}
  }

  componentDidMount(){
    this.getPhotoData();
  }

  componentDidUpdate(prevProps) {
    if (this.props.filters !== prevProps.filters || this.state.photos == []) {
      this.getPhotoData(true);
    }
  }

  getPhotoData(reset){
    var params = {}

    if(this.state.fetching_data){
      console.log("Already fetching data, skiping data refresh.")
      return;
    }

    if(typeof this.props.filters === 'undefined'){
      console.debug("Filters undefined in refreshData()")
      return;
    }

    for (const [key, value] of Object.entries(this.props.filters)){
      if (value){
        params[key] = value;
      }
    }

    if(this.state.last_photo_key && !reset){
      params["LastPhotoKey"] = this.state.last_photo_key;
    }

    params["max_results"] = 50;

    this.setState({fetching_data: true});
    /*
    Make sure the async process to fetch access tokens has completed before continuing.
    */
    if (this.props.jwt){
      const requestOptions = {
        mode: 'cors',
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.props.jwt
        }
      };
      var url = new URL(process.env.REACT_APP_API_ENDPOINT + "/photo");
      url.search = new URLSearchParams(params).toString();
      fetch(url, requestOptions)
        .then(response => response.json())
        .then(data => {
          console.log(data)

          var newPhotos;
          if(reset){
            newPhotos = data["Items"]
          } else {
            newPhotos = this.state.photos.concat(data["Items"])
          }

          this.setState({photos: newPhotos, fetching_data: false})

          /*
          Check to see if we got a "LastEvaluatedKey".  If so, there
          are more pages of thumbnails that match our filters.
          */
          var lpk = "";
          if ("LastPhotoKey" in data){
            lpk = data["LastPhotoKey"];
          }
          console.debug("LPK: " + lpk)
          this.setState({last_photo_key: lpk})

          /*
          Check to see if there are more photos to get AND we have space left
          on the visible page.  If so, keep getting thumbnails.
          */
          // if(lek && document.body.clientHeight < window.innerHeight){
          //   console.debug("MOAR DATA")
          //   this.getPhotoData()
          // }
        })
        .catch(error => {
          console.log(error);
       });
    } else {
      console.log("No JWT Token yet.");
    }
  }

  updatePhotoData(photo_id, key, value){
    let photos = [...this.state.photos]
    var i;
    for (i=0; i<photos.length; i++){
      if (photos[i]["SK"] === photo_id){
        //Check if a filter has changed such that this photo would be excluded.
        //This should only happen if the rating filter is set to "unrated"
        if(this.props.filters.rating === "unrated" && key === "GSI1PK"){
          photos.splice(i, 1)
        } else {
          //If it wasn't a filter update, update the metadata value.
          let photo = {...photos[i]}
          photo[key] = value;
          photos[i] = photo;
        }

        //No matter what changed, update the photos.
        this.setState({photos: photos})
        break;
      }
    }
  }

  render(){
    console.debug("Rendering PhotoFlowData")
    var results_truncated = false;
    if(this.state.last_photo_key){
      results_truncated = true;
    }

    return (
        <PhotoFlow photos={this.state.photos} results_truncated={results_truncated} get_photos={this.getPhotoData} update_metadata={this.updatePhotoData} jwt={this.props.jwt}/>
    )
  }
}

class PhotoFlow extends React.Component {
  constructor(props){
    super(props);
    console.debug("PhotoFlow Constructor!")
    this.handlePhotoFocus = this.handlePhotoFocus.bind(this)
    this.handleMetadataUpdate = this.handleMetadataUpdate.bind(this)
    this.closePhotoFocus = this.closePhotoFocus.bind(this)

    this.state = {
      focusPhoto:{},
      focusModalVisible:false,
      fetching_data: false
    }
  }

  handleMetadataUpdate(photo_id, key, value){
    this.props.update_metadata(photo_id, key, value);

    if (this.state.focusPhoto.SK === photo_id){
      var photo = this.state.focusPhoto;
      photo[key] = value;
      this.setState({"focusPhoto": photo})
    }
  }

  handlePhotoFocus(photo){
    this.setState({focusPhoto: photo, focusModalVisible: true});
  }

  closePhotoFocus(){
    this.setState({focusModalVisible: false});
  }

  componentDidMount(){
    document.addEventListener('scroll', this.trackScrolling);
  }

  componentWillUnmount() {
    document.removeEventListener('scroll', this.trackScrolling);
  }

  isBottom(el) {
    return el.getBoundingClientRect().bottom <= window.innerHeight;
  }

  trackScrolling = () => {
    const wrappedElement = document.getElementById('photoFlowDiv');
    if (this.isBottom(wrappedElement)) {
      console.log('photoFlow bottom reached');
      if(this.props.results_truncated){
        this.props.get_photos();
      }
    }
  };

  render() {
    //Assume a sorted list of photos has come back from the API.
    var photo_groups = []
    var curr_header = ""
    var groups = 0
    //console.log(this.state.photos);
    for(var i=0; i<this.props.photos.length; i++){
      var photo = this.props.photos[i];
      //console.log(photo);
      if (curr_header !== photo.SK.split("T")[0]){
        curr_header = photo.SK.split("T")[0]
        photo_groups.push({header: curr_header, photos: []});
        groups++;
      }
      photo_groups[groups-1]['photos'].push(photo);
    };

    const listItems = photo_groups.map((photo_data) => (
        <li key={photo_data.header}><PhotoGroup header={photo_data.header} data={photo_data.photos} photoFocusHandler={this.handlePhotoFocus}/></li>
    ));

    return (
       <div id='photoFlowDiv'>
       <br/>
       <span className="section-title">Photos!</span>
       <ul>
          {listItems}
        </ul>

          <PhotoDetailModal
            show={this.state.focusModalVisible}
            onHide={this.closePhotoFocus}
            photo={this.state.focusPhoto}
            jwt={this.props.jwt}
            updateHandler={this.handleMetadataUpdate}
          />

      </div>
    )
  }
}

class PhotoGroup extends React.Component{
  constructor(props){
    super(props);
  }
  render(){
    const listItems = this.props.data.map((photo) =>
      <li key={photo.SK}><Thumbnail data={photo} onClickHandler={this.props.photoFocusHandler}/> </li>
    );
    return(
      <div>
        <span>{this.props.header}</span>
        <ul className="ul_thumbnail">
          {listItems}
        </ul>
      </div>
    )
  }
}

class Thumbnail extends React.Component{
  constructor(props){
    super(props);
    this.clickHandler = this.clickHandler.bind(this)
    this.state = {clickHandler: this.clickHandler};
  }

  clickHandler(){
    this.props.onClickHandler(this.props.data)
  }

  componentDidMount () {
    //Extract the bucket and object key from the response
    const thumbnail_arr = this.props.data.thumbnail_key.split("/", 1);
    const thumbnail_bucket = thumbnail_arr[0];
    const thumbnail_key = this.props.data.thumbnail_key.slice(thumbnail_bucket.length + 1)

    /*
    Sign a URL for the thumbnail using the Role associated with our login so that we can
    access the private bucket.
    */
    const clientParams = {
      region: process.env.REACT_APP_AWS_REGION,
      credentials: AWS.config.credentials
    }
    const getObjectParams = {
      Bucket: thumbnail_bucket,
      Key: thumbnail_key
    }
    const client = new S3Client(clientParams);
    const command = new GetObjectCommand(getObjectParams);
    getSignedUrl(client, command, { expiresIn: 3600 })
    .then((url) => {
      this.setState({url: url});
    })
    .catch((err) => {
      console.log(err);
    });
  }

  render(){
    const url = this.state.url;
    const clickHandler = this.state.clickHandler;
    if (url){
      return(<ThumbnailImage url={url} clickHandler={clickHandler} />);
    } else {
      return null;
    }

  }
}

class ThumbnailImage extends React.Component{
  constructor (props) {
    super(props);
    this.state = {};
  }

  render() {
    return (
        <img className="thumbnail" src={this.props.url} alt="" onClick={this.props.clickHandler}/>
    );
  }
}

class PhotoFilterPane extends React.Component {
  constructor(props){
    super(props);

    this.togglePane = this.togglePane.bind(this)
    this.handleValueChanged = this.handleValueChanged.bind(this)
    this.submitFilters = this.submitFilters.bind(this)
    this.cancelFilters = this.cancelFilters.bind(this)
    this.loadFilterValuesFromStorage = this.loadFilterValuesFromStorage.bind(this);
    this.saveFilterValuesToStorage = this.saveFilterValuesToStorage.bind(this);

    this.state = {
      "pane_open": false,
    }
  }

  componentDidMount(){
    this.loadFilterValuesFromStorage();
  }

  loadFilterValuesFromStorage(){
    var start_date = localStorage.getItem('start_date_filter')
    if (typeof start_date === 'undefined'){
      start_date = ""
    }

    var end_date = localStorage.getItem('end_date_filter')
    if (typeof end_date === 'undefined'){
      end_date = ""
    }

    var rating = localStorage.getItem('rating_filter')
    if (typeof rating === 'undefined'){
      rating = "all"
    }

    console.debug("start_date: " + start_date)
    console.debug("end_date: " + end_date)
    console.debug("rating: " + rating)

    this.setState(
      {
        "current_filter_values": {
          "start_date": start_date,
          "end_date": end_date,
          "rating": rating
        },
        "filter_values": {
          "start_date": start_date,
          "end_date": end_date,
          "rating": rating
        }
      }
    );
  }

  saveFilterValuesToStorage(){
    if(this.state.current_filter_values.start_date){
      localStorage.setItem('start_date_filter', this.state.current_filter_values.start_date)
    }
    if(this.state.current_filter_values.end_date){
      localStorage.setItem('end_date_filter', this.state.current_filter_values.end_date)
    }
    if(this.state.current_filter_values.rating){
      localStorage.setItem('rating_filter', this.state.current_filter_values.rating)
    }
  }

  togglePane(){
    this.setState({
      "pane_open": !this.state.pane_open
    })
  }

  handleValueChanged(field, value){
    console.debug("In handleValueChanged")
    console.debug("field: " + field)
    console.debug("value: " + value)
    var filter_vals = Object.assign({}, this.state.current_filter_values);
    filter_vals[field] = value

    console.debug(filter_vals)

    this.setState({current_filter_values: filter_vals})
  }

  submitFilters(){
    console.debug(this.state.current_filter_values)
    this.saveFilterValuesToStorage()
    this.togglePane()
    var filter_vals = Object.assign({}, this.state.current_filter_values);
    this.setState({"filter_values": filter_vals});
  }

  cancelFilters(){
    console.debug("Cancel Filters")
    this.loadFilterValuesFromStorage();
    this.togglePane();
  }

  render(){
    console.debug("Rendering FilterPane")
    console.debug(this.state.filter_values)
    const filter_values = this.state.filter_values;
    const isPaneOpen = this.state.pane_open;
    return (
      <div className="filter-pane">
        <button  type="button" className="btn btn-secondary" onClick={this.togglePane}> {isPaneOpen ? 'Hide Filters' : 'Show Filters'} </button>

        {isPaneOpen &&
          <div className="filter-table">
            <table><tbody>
              <tr>
                <td> Start Date</td>
                <td> End Date</td>
                <td> Rating </td>
              </tr>
              <tr>
                <td> <DateFilterControl field="start_date" value={this.state.current_filter_values.start_date} onValueChange={this.handleValueChanged}/> </td>
                <td> <DateFilterControl field="end_date" value={this.state.current_filter_values.end_date} onValueChange={this.handleValueChanged}/> </td>
                <td> <RatingFilterControl field="rating" value={this.state.current_filter_values.rating} onValueChange={this.handleValueChanged}/> </td>
              </tr>
              <tr>
                <td> <button type="button" className="btn btn-secondary" onClick={this.submitFilters}>Submit</button> </td>
                <td> <button type="button" className="btn btn-secondary" onClick={this.cancelFilters}>Cancel</button></td>
              </tr>
            </tbody></table>
          </div>
        }
        <PhotoFlowData jwt={this.props.jwt} filters={filter_values}/>
      </div>
    )
  }
}

class DateFilterControl extends React.Component{
  constructor(props){
    super(props);
    this.handleChange = this.handleChange.bind(this)
    this.state = {'value': this.props.value}
  }

  handleChange(e){
    this.setState({'value': e.target.value});
    console.debug(Date.parse(e.target.value))
    if(Date.parse(e.target.value)){
      console.debug("It worked!");
      this.props.onValueChange(this.props.field, e.target.value);
    }
  }

  render(){
    console.debug("debug");
    return(
    <input value={this.state.value} onChange={this.handleChange} />
  )
  }
}

class RatingFilterControl extends React.Component{
  constructor(props){
    super(props);
    this.handleChange = this.handleChange.bind(this);
    this.state = {'value': this.props.value}
  }

  handleChange(e){
    console.debug(e)
    this.setState({'value': e});
    this.props.onValueChange(this.props.field, e);
  }

  render(){
    const keyval = {
      "all": "All Ratings",
      "1": "1+",
      "2": "2+",
      "3": "3+",
      "4": "4+",
      "5": "5",
      "unrated": "Unrated"
    }

    const title = keyval[this.state.value]
    return (
      <DropdownButton id="rating_filter" title={title} onSelect={this.handleChange}>
        <Dropdown.Item eventKey="all">All Ratings</Dropdown.Item>
        <Dropdown.Item eventKey="1">1+</Dropdown.Item>
        <Dropdown.Item eventKey="2">2+</Dropdown.Item>
        <Dropdown.Item eventKey="3">3+</Dropdown.Item>
        <Dropdown.Item eventKey="4">4+</Dropdown.Item>
        <Dropdown.Item eventKey="5">5</Dropdown.Item>
        <Dropdown.Divider />
        <Dropdown.Item eventKey="unrated">Unrated</Dropdown.Item>
      </DropdownButton>
    )
  }
}

class Galleries extends React.Component {
  constructor(props){
    super(props);
  }

  render() {
    return <h1>Galleries!</h1>
  }
}

class Settings extends React.Component {
  constructor(props){
    super(props);
  }

  render() {
    return (<h1>Settings!</h1>)
  }
}

class App extends React.Component {

  sessionIsExpired = (token) => {
    const sessionExpiration = token.payload.exp;
    const currentTime = Math.floor(Date.now()/1000);
    return (sessionExpiration < currentTime);
  }

  checkSession = (session) => {
    AWS.config.region = process.env.REACT_APP_AWS_REGION;

    const id_key = 'cognito-idp.' + process.env.REACT_APP_AWS_REGION + '.amazonaws.com/' + process.env.REACT_APP_COGNITO_USER_POOL_ID;

    console.log("Getting credentials")
    console.log(id_key)
    AWS.config.region = 'us-east-2';
    AWS.config.credentials = new AWS.CognitoIdentityCredentials({
      IdentityPoolId: process.env.REACT_APP_COGNITO_IDENTITY_POOL,
      Logins: { // optional tokens, used for authenticated login
          [id_key]: session.idToken.jwtToken,
      }
    });

    // Make the call to obtain credentials
    AWS.config.credentials.get(function(){

        // Credentials will be available when this function is called.
        var accessKeyId = AWS.config.credentials.accessKeyId;
        var secretAccessKey = AWS.config.credentials.secretAccessKey;
        var sessionToken = AWS.config.credentials.sessionToken;
        console.log(AWS.config.credentials);

    });

    this.saveSession(session);
  }

  saveCredentials = (result) => {
      console.log(result);
  }

  saveSession = (session) => {
    console.log("Sign in success");
    console.log(session)
    this.setState(session);
  }

  constructor(props){
    super(props);
    this.state = {view: "Photos"}

    this.auth = new AmazonCognitoIdentity.CognitoAuth(authData);
    this.auth.userhandler = {
      onSuccess: this.checkSession,
      onFailure: function(err) {
        console.log("Error!");
        console.log(err)
      }
    };
    this.auth.useCodeGrantFlow()
    var curUrl = window.location.href;
    this.auth.parseCognitoWebResponse(curUrl);
  }

  componentDidMount(){
    if (this.auth.getCurrentUser()) {
      console.log(this.auth);
      if (this.sessionIsExpired(this.auth.signInUserSession.accessToken)){
        console.debug("Panic!")
        this.auth.signOut();
      }
      this.auth.getSession();
    }
  }

  viewChangeHandler=(view)=>{
    this.setState({view})
  }

  buttonHandler=()=>{
    if(this.state.accessToken){
      this.auth.signOut()
    } else {
      this.auth.getSession()
    }
  }

  render() {
    const view = this.state.view;
    console.log(this.state)
    const activeSession = this.state.accessToken ? true : false
    var jwt = ""
    if (this.state.accessToken){
      jwt = this.state.accessToken.jwtToken
    }

    return (
        <div>
          <button type="button" className="btn btn-secondary login" onClick={this.buttonHandler}>{activeSession ? "Logout" : "Login"}</button>
          {activeSession &&
          <div>
            <Header navHandler={this.viewChangeHandler} />
            <Content view={view} jwt={jwt} />
          </div>
          }
          <div id="modal-root"></div>

        </div>
    )
  }
}

//export default withAuthenticator(App);
export default App;
