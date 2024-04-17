import React, { Component} from "react";


class TextEntry extends React.Component {  

  constructor(props) {
    super(props); // uiState
    this.state={inputValue: this.props.initialValue?this.props.initialValue:""};
  }
  
  commit() {
    //console.log("Text entry commits value " + this.state.inputValue);
    this.props.onSubmit(this.state.inputValue);
  }
  
  updateInputValue(evt) {
    //console.log("updateInputValue new value = " + JSON.stringify(evt.target.value));
    this.setState({
      inputValue: evt.target.value
    });
  }
  
  submit(e) {
    e.stopPropagation();
    e.preventDefault();
    this.commit();
  }
  
  render() {
    return <div style={{textAlign:"center", backgroundColor:"white"}}>
      <p style={{fontSize:"32px"}}>{this.props.heading}</p>
      <p style={{fontSize:"18px"}}>{this.props.message}</p>
      <form onSubmit={this.submit.bind(this)} ><input type="text" size="50" value={this.state.inputValue} 
        onChange={this.updateInputValue.bind(this)}/></form>
      <input type="button" value="Ok" onClick={this.commit.bind(this)}/>
    </div>;
  }
}

export default class StorageConnectionModal extends React.Component {  

  constructor(props) {
    super(props); 
    this.state = {xoff:0, yoff:0, cursor:"default"};
  }
  
  componentDidUpdate(prevProps) {
  }
  
  render() {
    let width=window.innerWidth;
    let height=window.innerHeight;
    let heading = "No storage connection string entered yet";
    let msg = "Please enter connection string to the storage container holding the noise data";
    if(this.props.status=="error") {
      heading = "An error occurred connecting to the storage account.";
      msg = this.props.message;
    }
    return <div style={{cursor:this.state.cursor, width:""+width+"px", height:""+height+"px", textAlign:"center"}}>
      <div onClick={(e)=>{e.stopPropagation();}} onMouseEnter={(e)=>{e.stopPropagation();}} 
        onMouseLeave={(e)=>{e.stopPropagation();}} style={{
          width:""+width+"px", 
          height:""+height+"px", 
          backgroundColor:"gray", 
          opacity:0.5, 
          position:"fixed", 
          top:"0px", 
          zIndex:9999}}>
      </div>
      <div style={{
          touchAction: "none",
          backgroundColor:"white", 
          padding:"5px", 
          boxShadow: "3px 3px 5px black", 
          borderRadius:"10px", 
          position:"absolute", 
          top:"50%", 
          left:"50%", 
          display:"inline-block", 
          zIndex:10000, 
          transform: "translate(-50%, -50%) translate("+this.state.xoff+"px, " + this.state.yoff + "px)"
          }}><TextEntry heading={heading} message={msg} onSubmit={this.props.onSubmit}/></div>
    </div>;
  }
}

export {TextEntry, StorageConnectionModal}