import React, { Component} from "react";
import {bands} from "./NMDataWindow.js";
import {TextEntry} from "./StorageConnectionModal.js";

export default class SettingsDialog extends React.Component {  

  constructor(props) {
    super(props); // heading, info, gameState, playerName, choices array of key value pairs [{a:b},{c:d}], numChoices, allowCancel, noPrettyPrinting
    this.state = props.settings;
    console.log("creating settings with choices " + JSON.stringify(this.state.visibleTS));
    this.state.maxAllowedBands = 5;
  }
  
  cancel() {
    this.props.callback(null);
  }
  
  commit(storageConnectionString) {
    if(storageConnectionString) {
      this.setState(ps => {
        ps.storageConnectionString = storageConnectionString;
        return ps;
      });
    }
    //console.log("Choice is pushing selected indices back into deactivate modal: " + JSON.stringify(this.state.selectedIndices));
    this.props.callback({...this.state,storageConnectionString:storageConnectionString?storageConnectionString:this.state.storageConnectionString});
  }
  
  toggleBand(bandId) {
    this.setState(s=>{
      let idx = s.visibleTS.indexOf(bandId);
      if(idx>-1) { // already in selection -> unselect
        s.visibleTS.splice(idx,1);
      }
      else { // not in selection -> add 
        if(s.visibleTS.length >= this.state.maxAllowedBands) {
          console.log("cannot select more than " + this.state.maxAllowedBands + " elements");
          s.visibleTS.shift();
        }
        s.visibleTS.push(bandId);
      }
      return s;
    });
  }
  
  render() {
    //console.log("render, settings = " + JSON.stringify(this.props.settings));
    let bandColumns = [];
    let columnCount = 4;
    for(let i = 0; i < bands.length; i++) {
      let columnNo = i%columnCount;
      if(!bandColumns[columnNo]) bandColumns[columnNo] = [];
      bandColumns[columnNo].push(bands[i]);
    }
    return <div style={{textAlign:"center", backgroundColor:"white", borderRadius:"10px", padding:"20px", display:"flex", flexDirection:"column"}}>
      <div id="bandSelect" style={{display:"flex", flexDirection:"column"}}>
        <p style={{fontSize:"24px"}}>Please choose up to {this.state.maxAllowedBands} visible bands.</p>
        <div id="bandSelect" style={{display:"flex", flexDirection:"row"}}>
          {bandColumns.map( (c, idx) =>
            <ul key={"bandColumn_"+idx} className="choiceList">
            {c.map((b,bidx)=>
              <li key={b} className={"choiceItem"+(this.state.visibleTS.indexOf(b)>-1?" active":"")} onClick={this.toggleBand.bind(this,b)}>{b.substring(3,b.length) + (Object.values(this.props.settings.thresholds).indexOf(b.substring(3,b.length))>-1?" *":"")}</li>)}
          </ul>)}
        </div>
      </div>
      <div id="storageConfig">
        <TextEntry initialValue={this.props.settings.storageConnectionString} heading={"StorageConnectionString"} message={""} onSubmit={this.commit.bind(this)}/>
      </div>
    </div>;
  }
}