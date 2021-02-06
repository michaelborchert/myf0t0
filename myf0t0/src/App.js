import React from 'react';
import ReactDOM from 'react-dom'
import './index.css';
import Modal from 'react-bootstrap/Modal'
import Button from 'react-bootstrap/Button'

import Amplify,{Auth, API} from 'aws-amplify';
import { withAuthenticator, AmplifySignOut } from '@aws-amplify/ui-react';

Amplify.configure({
  Auth: {
    region: 'us-east-2',
    userPoolId: 'us-east-2_oQdtzjMQ1',
    userPoolWebClientId: '55i8vm5ina7g9v1j86cpmp6gjv',
    mandatorySignIn: true,
    oauth: {
              domain: 'myf0t0-teststack2',
              scope: ['phone', 'email', 'profile', 'openid', 'aws.cognito.signin.user.admin'],
              redirectSignIn: 'http://localhost:3000/',
              redirectSignOut: 'http://localhost:3000/',
              responseType: 'code' // or 'token', note that REFRESH token will only be generated when the responseType is code
          }
    },
    API: {
        endpoints: [
            {
                name: "myf0t0",
                endpoint: process.env.REACT_APP_API_ENDPOINT
            }
        ]
    }
  }
);

class Header extends React.Component {
  constructor(props){
    super(props);

    this.handleNavClick = this.handleNavClick.bind(this);
    this.handleSignoutClick = this.handleSignoutClick.bind(this);
  }

  handleNavClick(view){
    this.props.navHandler(view);
  }

  async handleSignoutClick(){
    try {
        await Auth.signOut();
        window.location.reload(false);
    } catch (error) {
        console.log('error signing out: ', error);
    }
  }

  render() {
    return (<div className="header">
      <NavButton view="Photos" navClickHandler={this.handleNavClick} />
      <NavButton view="Galleries" navClickHandler={this.handleNavClick} />
      <NavButton view="Settings" navClickHandler={this.handleNavClick} />
      <Button onClick={this.handleSignoutClick}> Sign Out </Button>
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
        {this.props.view === "Photos" && <PhotoFlow />}
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
    console.log(this.props)
    var photoName = ""
    if ("SK" in this.props.photo){
      photoName = this.props.photo.SK.split("_")[1];
    }

    return (
      <Modal
      {...this.props}
      //size="lg"
      aria-labelledby="contained-modal-title-vcenter"
      dialogClassName="photo-modal"
      centered
    >
      <Modal.Header closeButton>
        <Modal.Title id="contained-modal-title-vcenter">
          {photoName}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <img className="focus-photo" src={this.props.photo.GSI1SK} alt="" />
      </Modal.Body>
      <Modal.Footer>
        <Button onClick={this.props.onHide}>Close</Button>
      </Modal.Footer>
    </Modal>
  );
  }
}
class PhotoFlow extends React.Component {
  constructor(props){
    super(props);
    this.handleFilterUpdate = this.handleFilterUpdate.bind(this)
    this.handlePhotoFocus = this.handlePhotoFocus.bind(this)
    this.closePhotoFocus = this.closePhotoFocus.bind(this)
    this.getThumbnails = this.getThumbnails.bind(this)
    this.state = {photos:{}, focusPhoto:{}, focusModalVisible:false}
  }

  handleFilterUpdate(filter_params){
    //console.log(filter_params);

    this.getThumbnails(filter_params)
  }

  handlePhotoFocus(photo){
    this.setState({focusPhoto: photo, focusModalVisible: true});
  }

  closePhotoFocus(){
    this.setState({focusModalVisible: false});
  }

  componentDidMount(){
    this.getThumbnails({});
  }

  async getThumbnails(params){
    var searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)){
      //console.log(key)
      if ( value ){
        //console.log(value)
        searchParams.append(key, value)
      }
    }
    console.log(searchParams.toString());

    const apiName = 'myf0t0';
    const path = '/photo';
    const myInit = { // OPTIONAL
        queryStringParameters: params,
    };

    API
      .get(apiName, path, myInit)
      .then(response => {
        // Add your code here
        this.setState({photos: response})
      })
      .catch(error => {
        console.log(error.response);
     });
    /*var url = process.env.REACT_APP_API_ENDPOINT + "/photo?" + searchParams.toString();
    fetch(url, {
      method: 'GET',
      mode: 'cors'
    })
    .then(res => res.json())
    .then(
      (result) => {
        console.log(result);
        this.setState({photos: result})
      },
      (error) => {
        console.error(
          "There has been a problem with your fetch operation:",
          error
        )
      }
    )*/

  }

  render() {
    //Assume a sorted list of photos has come back from the API.
    var photo_groups = []
    var curr_header = ""
    var groups = 0
    console.log(this.state.photos);
    for(var i=0; i<this.state.photos.length; i++){
      var photo = this.state.photos[i];
      console.log(photo);
      if (curr_header !== photo.SK.split("T")[0]){
        curr_header = photo.SK.split("T")[0]
        photo_groups.push({header: curr_header, photos: []});
        groups++;
      }
      photo_groups[groups-1]['photos'].push(photo);
    };


    //console.log(photo_groups)

    const listItems = photo_groups.map((photo_data) => (
        <li key={photo_data.header}><PhotoGroup header={photo_data.header} data={photo_data.photos} photoFocusHandler={this.handlePhotoFocus}/></li>
    ));

    return (
       <div>
       <h1>Photos!</h1>
        <PhotoFilterPane filterHandler={this.handleFilterUpdate}/>
        <ul>
          {listItems}
        </ul>

          <PhotoDetailModal
            show={this.state.focusModalVisible}
            onHide={this.closePhotoFocus}
            photo={this.state.focusPhoto}
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
  }

  clickHandler(){
    this.props.onClickHandler(this.props.data)
  }

  render(){
    return (
      <img src={this.props.data.thumbnail_key} alt="" onClick={this.clickHandler}/>
      //<span>Photo Goes Here!</span>
    )
  }
}

class PhotoFilterPane extends React.Component {
  constructor(props){
    super(props);
    this.state = {"pane_open": false, "start_date": "", "end_date": ""}
    this.togglePane = this.togglePane.bind(this)
    this.applyFilters = this.applyFilters.bind(this)
    this.handleValueChanged = this.handleValueChanged.bind(this)
  }

  togglePane(){
    this.setState({
      "pane_open": !this.state.pane_open
    })
  }

  applyFilters(){
    let filter_params = this.state;
    delete filter_params.pane_open
    this.props.filterHandler(filter_params)
  }

  handleValueChanged(field, value){
    console.log(field)
    console.log(value)
    this.setState({[field]: value})
  }

  render(){
    const isPaneOpen = this.state.pane_open;
    return (
      <div>
        <span>Filters<button onClick={this.togglePane}> {isPaneOpen ? '-' : '+'} </button></span>

        {isPaneOpen &&
          <div>
            <table><tbody>
              <tr>
                <td> Start Date</td>
                <td> End Date</td>
              </tr>
              <tr>
                <td> <FilterControl field="start_date" value={this.state.start_date} onValueChange={this.handleValueChanged} /> </td>
                <td> <FilterControl field="end_date" value={this.state.end_date} onValueChange={this.handleValueChanged} /> </td>
              </tr>
            </tbody></table>
            <button onClick={this.applyFilters}> Apply </button>
          </div>
        }
      </div>
    )
  }
}

class FilterControl extends React.Component{
  constructor(props){
    super(props);
    this.handleChange = this.handleChange.bind(this)
  }

  handleChange(e){
    this.props.onValueChange(this.props.field, e.target.value);
  }

  render(){
    return(
    <input value={this.props.value} onChange={this.handleChange} />
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
  constructor(props){
    super(props);
    this.state = {view: "Photos"}

    this.viewChangeHandler = this.viewChangeHandler.bind(this);
  }

  viewChangeHandler(view){
    this.setState({view})
  }

  render() {
    const view = this.state.view;
    return (
      <div>
        <Header navHandler={this.viewChangeHandler} />
        <Content view={view}/>
        <div id="modal-root"></div>
      </div>
    )
  }
}

export default withAuthenticator(App);
