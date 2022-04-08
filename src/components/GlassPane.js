import React, { Component} from "react";

export default class GlassPane extends React.Component {  

  constructor(props) {
    super(props); // uiState
  }
  
  render() {
    let width=window.innerWidth;
    let height=window.innerHeight;
    if(this.props.uiState.status!="auto") return null;
    return <div style={{width:""+width+"px", height:""+height+"px", textAlign:"center"}}>
      <div onClick={(e)=>{e.stopPropagation();}} onMouseEnter={(e)=>{e.stopPropagation();}} 
        onMouseLeave={(e)=>{e.stopPropagation();}} 
        style={{
          width:""+width+"px", 
          height:""+height+"px", 
          backgroundColor:"gray", 
          opacity:this.props.uiState.gameStatus=="loading"?1:0.3, 
          position:"fixed", 
          top:"0px", 
          zIndex:9999}}>
      </div>
      <div id="loading" style={{
        padding:"5px", 
        position:"absolute", 
        top:"50%", 
        marginTop:"-25px",
        marginLeft:"-25px", 
        display:"inline-block", 
        zIndex:10000}}></div>
        {this.props.uiState.message?<div id="spinmsg"style={{
        padding:"5px", 
        position:"absolute", 
        top:"50%", 
        marginTop:"-25px",
        marginLeft:"-25px", 
        display:"inline-block",
        transform: "translate(0,-50px)",
        zIndex:10000}}>{this.props.uiState.message}</div>:""}
    </div>;
  }
}
