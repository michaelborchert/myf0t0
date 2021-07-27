import React from 'react';
import './index.css';
import Badge from 'react-bootstrap/Badge'
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
      <NavButton view="Photos" navClickHandler={this.handleNavClick} currentView={this.props.view}/>
      <NavButton view="Galleries" navClickHandler={this.handleNavClick} currentView={this.props.view}/>
      <NavButton view="Settings" navClickHandler={this.handleNavClick} currentView={this.props.view}/>
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
    var myClass = "nav-button"
    if (this.props.view === this.props.currentView){
      myClass = "nav-button selected"
    }
    return (
      <span className={myClass} onClick={this.handleNav}> {this.props.view} </span>
    )
  }
}

class Content extends React.Component {
  constructor(props){
    super(props);
  }

  render(){
    console.log(this.props);
    return (
      <div className="content">
        {this.props.view === "Photos" && <PhotoFilterPane jwt={this.props.jwt} navHandler={this.props.navHandler}/>}
        {this.props.view === "Galleries" && <GalleryList jwt={this.props.jwt} />}
        {this.props.view === "Settings" && <Settings />}
        {this.props.view === "Gallery" && <Gallery />}
      </div>
  )
  }
}

class PhotoDetailModal extends React.Component{
  constructor(props){
    super(props);
  }

  handlePrevClick = () => {
    this.props.photoFocusHandler(this.props.photo.previous)
  }

  handleNextClick = () => {
    this.props.photoFocusHandler(this.props.photo.next)
  }

  render(){
    const galleryMode = this.props.jwt ? true : false
    const next = this.props.photo.next ? true : false;
    const previous = this.props.photo.previous ? true : false;

    return (
      <Modal
      {...this.props}
      //size="lg"
      dialogClassName="photo-modal"
      centered
    >
      <Modal.Header>
        {next &&
          <input type="button" className="next-photo" onClick={this.handleNextClick} value="Next"/>
        }
        {previous &&
          <input type="button" className="prev-photo" onClick={this.handlePrevClick} value="Prev"/>
        }

      </Modal.Header>
      <Modal.Body id="photo-modal-body">
        {this.props.jwt &&
          <div className="detail-photo">
            <PhotoDetailSigner data={this.props.photo} />
            <PhotoDetailData data={this.props.photo} jwt={this.props.jwt} updateHandler={this.props.updateHandler}/>
          </div>
        }
        {!this.props.jwt &&
          <div>
            <PhotoDetailImage url={this.props.photo.signed_url} />
          </div>
        }

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
      //var firstIndex = this.props.data.SK.indexOf('_');
      const sk = this.props.data.SK
      photoName = sk.substr(sk.indexOf('_')+1)
      //photoName = this.props.data.SK.split("_")[1];
    }
    console.debug(this.props.data);
    return(
      <div className="photo-data">
        { photoName && <h1> {photoName}</h1>}
        <PhotoRating data={this.props.data} jwt={this.props.jwt} updateHandler={this.props.updateHandler}/>
        <PhotoTagPane photo={this.props.data} jwt={this.props.jwt} updateHandler={this.props.updateHandler} />
        { exif &&
          <PhotoExifData exif={exif} />
        }
      </div>
    )
  }

}

class PhotoTagCloud extends React.Component{
  constructor(props){
    super(props);
  }

  render(){
    var tagList = "No Tags."
    if(this.props.tags){
      tagList = this.props.tags.map((tag) => (
          <PhotoTag tag={tag} removeTagFunction={this.props.removeTagFunction}/>
      ));
    }

    return(
      <div className="tag-cloud">
      <ul>
       {tagList}
     </ul>
     </div>
   )
  }

}

class PhotoTag extends React.Component{
  constructor(props){
    super(props);
  }

  getTagColor(tag){
      //TODO - use a pseudorandom color based on the Tag name as a seed
      var myrng = new Math.seedrandom(tag);
      var color_index = Math.round(5.0 * myrng.quick())
      const colors = ["green", "red", "blue", "yellow", "orange", "light-blue"]
      return(colors[color_index])
  }

  removeButtonHandler = () => {
    this.props.removeTagFunction(this.props.tag)
  }

  render(){
    const style = {"background-color": this.getTagColor(this.props.tag)}
    return(
      <div className="photo-tag" style={style} >
        <span> {this.props.tag} </span> <button  type="button" className="tag-button" onClick={this.removeButtonHandler}>x</button>
      </div>
    )
  }
}

class PhotoTagInput extends React.Component{
  constructor(props){
    super(props);
    this.state = {"tag_value": ""}
    this.handleChange = this.handleChange.bind(this);
  }

  addButtonHandler = () => {
    this.props.addTagFunction(this.state.tag_value)
    this.setState({"tag_value": ""})
  }

  handleChange = (e) => {
    this.setState({"tag_value": e.target.value})
  }

  render(){
    const curr_value = this.state.tag_value;
    return(
      <div className="tag-input">
        Add Tag: <input className="tag-input-box" value={curr_value} onChange={this.handleChange} />
        { curr_value &&
          <button  type="button" className="btn btn-secondary tag-input-button" onClick={this.addButtonHandler}>ok</button>
        }
      </div>
    )
  }
}

class PhotoTagPane extends React.Component{
  constructor(props){
    super(props);
    this.addTag = this.addTag.bind(this);
    this.removeTag = this.removeTag.bind(this);
  }

  async addTag(tag){
    //Make the API call to add the Tag.
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
      var url = new URL(process.env.REACT_APP_API_ENDPOINT + "/tag");
      const params = {"photo_id": this.props.photo.SK, "tag": tag}
      console.debug(params);
      url.search = new URLSearchParams(params).toString();
      fetch(url, requestOptions)
        .then(response => response.json())
        .then(data => {
          console.log(data)

          //Update the metadata state to add the tag.
          console.debug(this.props.photo.tags);
          var new_tags = []
          if (this.props.photo.tags){
            new_tags = [...this.props.photo.tags];
          }
          new_tags.push(tag)
          this.props.updateHandler(this.props.photo.SK, "tags", new_tags)
        })
    }
  }

  async removeTag(tag){
    //Make the API call to remove the Tag
    console.debug(this.props);
    if (this.props.jwt){
      const requestOptions = {
        mode: 'cors',
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.props.jwt
        }
      };
      var url = new URL(process.env.REACT_APP_API_ENDPOINT + "/tag");
      const params = {"photo_id": this.props.photo.SK, "tag": tag}
      console.debug(params);
      url.search = new URLSearchParams(params).toString();
      fetch(url, requestOptions)
        .then(response => response.json())
        .then(data => {
          console.log(data)

          //Update the metadata state to add the tag.
          console.debug(this.props.photo.tags);
          var new_tags = [...this.props.photo.tags];

          var tag_index = -1;
          for (var i=0; i<new_tags.length; i++){
            console.debug(new_tags[i] + " =?= " +tag);
            if (new_tags[i] === tag){
              tag_index = i;
            }
          }

          console.debug("tag_index: " + tag_index.toString());

          if(tag_index > -1){
            new_tags.splice(tag_index, 1)
            this.props.updateHandler(this.props.photo.SK, "tags", new_tags)
          }
        })
    }
  }

  render(){
    return(
      <div id="tag-pane" className="tag-pane">
        <PhotoTagCloud tags={this.props.photo.tags} removeTagFunction={this.removeTag }/>
        <PhotoTagInput addTagFunction={this.addTag} />
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
    this.generateSignedUrl();
  }

  componentDidUpdate(prevProps){
    if (prevProps.data.GSI1SK != this.props.data.GSI1SK){
      this.generateSignedUrl();
    }
  }

  generateSignedUrl = () => {
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

class Gallery extends React.Component{
  constructor(props){
    super(props);
    this.getPhotoData = this.getPhotoData.bind(this);
    this.updatePhotoData = this.updatePhotoData.bind(this);
    this.state = {photos: [], title: "", fetching_data: false}
  }

  componentDidMount(){
    this.getPhotoData();
  }

  getPhotoData(){
    if(this.state.fetching_data){
      console.log("Already fetching data, skiping data refresh.")
      return;
    }

    this.setState({fetching_data: true});
    const urlParams = new URLSearchParams(window.location.search);
    const gallery_id = urlParams.get('gallery');
    console.log("Gallery_ID: " + gallery_id)
    const requestOptions = {
      mode: 'cors',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    };
    var url = new URL(process.env.REACT_APP_API_ENDPOINT + "/gallery/" + gallery_id);
    fetch(url, requestOptions)
      .then(response => response.json())
      .then(data => {
        console.log(data)

        var newPhotos = data["Items"]

        this.setState({photos: newPhotos, title: data["GalleryName"], fetching_data: false})
      })
      .catch(error => {
        console.log(error);
     });
  }

  updatePhotoData(photo_id, key, value){
    console.log("PhotoUpdate from gallery")
  }

  render(){
    console.debug("Rendering Gallery")
    var results_truncated = false;

    return (
        <PhotoFlow title={this.state.title} photos={this.state.photos} results_truncated={results_truncated} get_photos={this.getPhotoData} update_metadata={this.updatePhotoData}/>
    )
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
        <PhotoFlow title={this.props.title} photos={this.state.photos} results_truncated={results_truncated} get_photos={this.getPhotoData} update_metadata={this.updatePhotoData} jwt={this.props.jwt}/>
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

    //If there is no previous photo set but there *are* more results, fetch the next batch.
    //This happens if we hit the end of the current batch using the navigation buttons in the photo detail modal.
    if(!photo.previous && this.props.results_truncated){
      this.props.get_photos();
    }
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
    var listItems = "No Photos To Display."
    if(this.props.photos){
      for(var i=0; i<this.props.photos.length; i++){
        var photo = this.props.photos[i];

        if (i>0){
          photo.next = this.props.photos[i-1]
        }

        if (i < this.props.photos.length - 1){
          photo.previous = this.props.photos[i+1]
        }

        //console.log(photo);
        if (curr_header !== photo.SK.split("T")[0]){
          curr_header = photo.SK.split("T")[0]
          photo_groups.push({header: curr_header, photos: []});
          groups++;
        }
        photo_groups[groups-1]['photos'].push(photo);
      };

      listItems = photo_groups.map((photo_data) => (
          <li className="photo-group" key={photo_data.header}><PhotoGroup header={photo_data.header} data={photo_data.photos} photoFocusHandler={this.handlePhotoFocus}/></li>
      ));
    }

    var title = ""
    if(this.props.title){
      title = this.props.title;
    }

    return (
       <div id='photoFlowDiv'>
       <br/>
       {title &&
         <span className="section-title">{title}</span>
       }
       <ul className="photo-group">
          {listItems}
        </ul>

          <PhotoDetailModal
            show={this.state.focusModalVisible}
            onHide={this.closePhotoFocus}
            photo={this.state.focusPhoto}
            jwt={this.props.jwt}
            updateHandler={this.handleMetadataUpdate}
            photoFocusHandler={this.handlePhotoFocus}
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
        <h4 className="group-divider">{this.props.header}</h4>
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

    var url = "";
    if (this.props.data.signed_thumbnail_url){
      url = this.props.data.signed_thumbnail_url
      this.setState({url: url});
    } else {
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
    this.saveGalleryClickHandler = this.saveGalleryClickHandler.bind(this);
    this.saveGalleryFunction = this.saveGalleryFunction.bind(this);
    this.closeGallerySaveModal = this.closeGallerySaveModal.bind(this);

    this.state = {
      "pane_open": false,
      "gallerySaveModalVisible": false
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

    var tags = localStorage.getItem('tags_filter')
    if ( typeof tags === 'undefined'){
      tags = ""
    }

    console.debug("start_date: " + start_date)
    console.debug("end_date: " + end_date)
    console.debug("rating: " + rating)
    console.debug("tags: " + tags)

    this.setState(
      {
        "current_filter_values": {
          "start_date": start_date,
          "end_date": end_date,
          "rating": rating,
          "tags": tags
        },
        "filter_values": {
          "start_date": start_date,
          "end_date": end_date,
          "rating": rating,
          "tags": tags
        }
      }
    );
  }

  saveFilterValuesToStorage(){
    if(this.state.current_filter_values.start_date != null){
      localStorage.setItem('start_date_filter', this.state.current_filter_values.start_date)
    }
    if(this.state.current_filter_values.end_date != null){
      localStorage.setItem('end_date_filter', this.state.current_filter_values.end_date)
    }
    if(this.state.current_filter_values.rating != null){
      localStorage.setItem('rating_filter', this.state.current_filter_values.rating)
    }
    if(this.state.current_filter_values.tags != null){
      localStorage.setItem('tags_filter', this.state.current_filter_values.tags)
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

  saveGalleryClickHandler(){
    this.setState({'gallerySaveModalVisible': true})
  }

  saveGalleryFunction(name){
    if (this.props.jwt){
      var filter_params = {}
      for (const [key, value] of Object.entries(this.state.current_filter_values)){
        if (value){
          filter_params[key] = value;
        }
      }

      const requestOptions = {
        mode: 'cors',
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.props.jwt
        }
      };
      console.debug(this.props);
      var url = new URL(process.env.REACT_APP_API_ENDPOINT + "/gallery");
      const params = {"name": name, "filters": JSON.stringify(filter_params)}
      url.search = new URLSearchParams(params).toString();
      fetch(url, requestOptions)
        .then(response => response.json())
        .then(data => {
          console.log(data)
          this.props.navHandler("Galleries")
        })
    }
  }

  closeGallerySaveModal(){
    this.setState({'gallerySaveModalVisible': false})
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
                <td> Tags </td>
              </tr>
              <tr>
                <td> <DateFilterControl field="start_date" value={this.state.current_filter_values.start_date} onValueChange={this.handleValueChanged}/> </td>
                <td> <DateFilterControl field="end_date" value={this.state.current_filter_values.end_date} onValueChange={this.handleValueChanged}/> </td>
                <td> <RatingFilterControl field="rating" value={this.state.current_filter_values.rating} onValueChange={this.handleValueChanged}/> </td>
                <td> <TagsFilterControl field="tags" value={this.state.current_filter_values.tags} onValueChange={this.handleValueChanged}/></td>
              </tr>
              <tr>
                <td> <button type="button" className="btn btn-secondary" onClick={this.submitFilters}>Submit</button> </td>
                <td> <button type="button" className="btn btn-secondary" onClick={this.cancelFilters}>Cancel</button></td>
                <td> <button type="button" className="btn btn-secondary" onClick={this.saveGalleryClickHandler}>Create Gallery</button></td>
              </tr>
            </tbody></table>
          </div>
        }
        <PhotoFlowData jwt={this.props.jwt} filters={filter_values} title=""/>
        <GallerySaveModal
          show={this.state.gallerySaveModalVisible}
          cancelFunction={this.closeGallerySaveModal}
          saveFunction={this.saveGalleryFunction}
        />
      </div>
    )
  }
}

class GallerySaveModal extends React.Component{
  constructor(props){
    super(props);
    this.handleChange = this.handleChange.bind(this)
    this.handleSaveClick = this.handleSaveClick.bind(this)
    this.handleCancelClick = this.handleCancelClick.bind(this)
    this.state = {'value': ''}
  }

  handleChange(e){
    this.setState({'value': e.target.value})
  }

  handleSaveClick(e){
    const value = this.state.value;
    this.setState({'value':''})
    this.props.saveFunction(value)

  }

  handleCancelClick(e){
    this.setState({'value': ''})
    this.props.cancelFunction()
  }

  render(){
    return(
      <Modal show={this.props.show} onHide={this.handleCancelClick} size="sm">
        <Modal.Header closeButton>
          <Modal.Title> Enter Name </Modal.Title>
        </Modal.Header>

      <Modal.Body>
        <div>
          Enter a name for the new Gallery <br/>
          <input value={this.state.value} onChange={this.handleChange}/>
        </div>
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" onClick={this.handleCancelClick}>
          Cancel
        </Button>
        <Button variant="primary" onClick={this.handleSaveClick}>
          Save
        </Button>
      </Modal.Footer>
    </Modal>

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

class TagsFilterControl extends React.Component{
  constructor(props){
    super(props);
    this.handleChange = this.handleChange.bind(this);
    this.state = {'value': this.props.value}
  }

  handleChange(e){
    this.setState({'value': e.target.value});
    this.props.onValueChange(this.props.field, e.target.value);
  }

  render(){
    return(
      <input value={this.state.value} onChange={this.handleChange} />
    )
  }
}

class GalleryList extends React.Component {
  constructor(props){
    super(props);
  }

  render() {
    return (
      <GalleryListingData jwt={this.props.jwt} />
    )
  }
}

class GalleryListingData extends React.Component{
  constructor(props){
    super(props);
    this.getGalleryList = this.getGalleryList.bind(this)
    this.deleteGallery = this.deleteGallery.bind(this)
    this.state = {fetching_data: false, galleryItems: []}
  }

  deleteGallery(e){
    console.log(e)
    const gallery_name = e.target.value
    if (this.props.jwt){
      const requestOptions = {
        mode: 'cors',
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.props.jwt
        }
      };
      var url = new URL(process.env.REACT_APP_API_ENDPOINT + "/gallery");
      const params = {"name": gallery_name}
      url.search = new URLSearchParams(params).toString();
      fetch(url, requestOptions)
        .then(response => response.json())
        .then(data => {
          console.log(data)

          //For now, assume that if we've gotten this far the delete was successful.
          var newGalleryItems = [...this.state.galleryItems]
          var i;
          for (i=0; i<newGalleryItems.length; i++){
            if (newGalleryItems[i]["SK"] === gallery_name){
              newGalleryItems.splice(i, 1)
              this.setState({galleryItems: newGalleryItems})
              break;
            }
          }
        }
      )
    }
  }

  getGalleryList(){
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
      var url = new URL(process.env.REACT_APP_API_ENDPOINT + "/gallerylist");
      fetch(url, requestOptions)
        .then(response => response.json())
        .then(data => {
          console.log(data)

          const newGalleryItems = data["Items"]

          this.setState({galleryItems: newGalleryItems, fetching_data: false})
        }
      )
    }
  }

  componentDidMount(){
    console.log("In GalleryListingData")
    this.getGalleryList()
  }

  render(){
    return(
      <GalleryListing data = {this.state.galleryItems} deleteFunction={this.deleteGallery}/>
    )
  }
}

class GalleryListing extends React.Component{
  constructor(props){
    super(props)
  }

  render(){
    var listItems = "No Galleries."

    if(this.props.data){
      //Sort list by timestamp (descending)
      var localData = [...this.props.data]
      localData.sort(function(a,b) {
        var keyA = new Date(a.timestamp),
          keyB = new Date(b.timestamp);
        return keyB-keyA;
      })

      listItems = localData.map((item) => (
          <li key={item.SK}><GalleryItem item={item} deleteFunction={this.props.deleteFunction}/></li>
      ));
    }


    return(
      <div className="gallery-listing">
        <ul className="gallery-list">
          {listItems}
        </ul>
      </div>
    )
  }
}

class GalleryItem extends React.Component{
  constructor(props){
    super(props)
    this.copyLink = this.copyLink.bind(this);
    this.getFilterDescription = this.getFilterDescription.bind(this);
    const url = window.location.protocol + "//" + window.location.href.split("/")[2] + "/?gallery=" + this.props.item.GSI1SK
    this.state = {'name': this.props.item.SK, 'url': url}
  }

  copyLink(){
    navigator.clipboard.writeText(this.state.url)
  }

  getFilterDescription(filters){
    var output = ""
    for (const [key, value] of Object.entries(JSON.parse(filters))) {
      output = output + key + "=" + value + ", ";
    }

    output = output.slice(0, -2);

    return(output);
  }

  render(){
    const filterDescription = this.getFilterDescription(this.props.item.filters);

    return (
      <div className="gallery-item">
        <div className="gallery-item-chunk">{this.state.name}</div>
        <div className="gallery-item-chunk">
          <span>{this.state.url}</span>
          <input className="icon-button link-copy-button" type="image" src="/link-icon.png" onClick={this.copyLink}/> <br/>
          <span className="small-text"> {filterDescription} </span>
        </div>
        <div className="gallery-item-chunk">
          <input className="icon-button" type="image" src="/delete-icon.png" value={this.state.name} onClick={this.props.deleteFunction}/> <br/>
        </div>

      </div>
    )
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
        //this.auth.signOut();
      }
      this.auth.getSession();
    }
  }

  setViewFunction(view){
    this.setState({'view': view})
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

    const urlParams = new URLSearchParams(window.location.search);
    const gallery_id = urlParams.get('gallery');
    const galleryMode = gallery_id ? true : false
    const activeSession = (this.state.accessToken ? true : false) && !galleryMode

    console.log("GalleryMode: " + galleryMode.toString() + ", ActiveSession: " + activeSession.toString())
    var jwt = ""
    if (this.state.accessToken){
      jwt = this.state.accessToken.jwtToken
    }

    return (
        <div>
          <button type="button" className="btn btn-secondary login" onClick={this.buttonHandler}>{activeSession ? "Logout" : "Login"}</button>
          {activeSession &&
            <div>
              <Header view={view} navHandler={this.viewChangeHandler} />
              <Content view={view} jwt={jwt} navHandler={this.viewChangeHandler}/>
            </div>
          }
          {galleryMode &&
            <div>
              <Content view="Gallery"/>
            </div>
          }
          <div id="modal-root"></div>

        </div>
    )
  }
}

//export default withAuthenticator(App);
export default App;
