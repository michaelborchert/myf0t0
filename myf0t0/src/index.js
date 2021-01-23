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
    this.handleFilterUpdate = this.handleFilterUpdate.bind(this)
  }

  handleFilterUpdate(e){
    console.log(e);
  }

  render() {
    return (
       <div>
       <h1>Photos!</h1>
        <PhotoFilterPane filterHandler={this.handleFilterUpdate}/>
      </div>
    )
  }
}

class PhotoFilterPane extends React.Component {
  constructor(props){
    super(props);
    this.state = {"pane_open": false}
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
    this.props.filterHandler(this.state)
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
                <td> <FilterControl field="start_date" onValueChange={this.handleValueChanged} /> </td>
                <td> <FilterControl field="end_date" onValueChange={this.handleValueChanged} /> </td>
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
      </div>
    )
  }
}

ReactDOM.render(
  <App />,
  document.getElementById('root')
);
