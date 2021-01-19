import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';

class Header extends React.Component {
  constructor(props){
    super(props);

    this.handleNavClick = this.handleNavClick.bind(this)
  }

  handleNavClick(view){
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
        {this.props.view === "Photos" && <PhotoFlow />}
        {this.props.view === "Galleries" && <Galleries />}
        {this.props.view === "Settings" && <Settings />}
      </div>
  )
  }
}

class PhotoFlow extends React.Component {
  constructor(props){
    super(props);
  }

  render() {
    return (
       <h1>Photos!</h1>
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
      </div>
    )
  }
}

ReactDOM.render(
  <App />,
  document.getElementById('root')
);
