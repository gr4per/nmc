import React, { Component} from "react";
import {ContainerClient, BlobCorsRule} from "@azure/storage-blob";
import Ring from "ringjs";
import StorageConnectionModal from "./StorageConnectionModal.js";
let debug = true;
let rcl = console.log;
console.log = function() {
  if(debug) rcl.apply(null,arguments);
}
import NMDataWindow from "./NMDataWindow.js"
import GlassPane from "./GlassPane.js";    
import {scaleLinear} from "d3-scale";
import DatePicker from "react-datepicker";
import Select from 'react-select'
import "react-datepicker/dist/react-datepicker.css";

import {
    TimeSeries,
    TimeRange,
    TimeRangeEvent,
    TimeEvent
} from "pondjs";

import {
  ChartContainer, 
  ChartRow, 
  Charts, 
  YAxis, 
  LineChart,
  EventChart, 
  Baseline, 
  Resizable, 
  Legend, 
  styler} from "react-timeseries-charts";

const sec = 1000;
const minute = 60 * sec;
const hours = 60 * minute;
const rate = 1000;
const defaultLength = 3600;
const windowDurationOptions = [{value:3600000, label:"1 hour"}, {value:7200000,label:"2 hours"},{value:10800000,label:"3 hours"},{value:14400000,label:"4 hours"},{value:18000000,label:"5 hours"},{value:21600000,label:"6 hours"},{value:25200000,label:"7 hours"},{value:28800000,label:"8 hours"}];

let logfn = console.log
console.log = function(){
  let args = Array.from(arguments);
  let datePf = "" + new Date().toISOString() + ": ";
  if(typeof args[0] == "string") {
    args[0] = datePf + args[0];
  }
  else {
    args.unshift("" + new Date().toISOString() + ": ");
  }
  logfn(...args);
}

function sleep(millis) {
  return new Promise(resolve => setTimeout(resolve, millis));
}

const stdInputStyle = {color: "black", fontSize: "large", fontWeight:"plain"};
const customSelectStyles = {
  option: (provided, state) => ({
    ...provided,
    ...stdInputStyle,
    borderBottom: '1px black',
    backgroundColor: state.isFocused?'lightgray':state.isSelected ? 'gray' : 'white',
    padding: 5,
  }),
  control: (provided, state) => ({
    ...provided,
    ...stdInputStyle,
    width: 500,
    fontSize: "large",
  }),
  singleValue: (provided, state) => ({
    ...provided,
    ...stdInputStyle,
    opacity: state.isDisabled ? 0.5 : 1,
    transition: 'opacity 300ms',
  })
}

function formatFloat(value) {
  if(typeof value != "string") {
    value = "" + value;
  }
  if(value.indexOf(".") >-1) {
    if(value.length > value.indexOf(".")+2){
      value = value.substring(0,Math.min(value.indexOf(".")+2));
    }
  }
  else {
    value += ".0";
  }
  return value;
}

// based on https://software.es.net/react-timeseries-charts/#/example/realtime

export default class NMC extends React.Component {  

  constructor(props) {
    super(props);
    this.version = "1.1.4";
    this.updateWindowDimensions = this.updateWindowDimensions.bind(this);

    this.retry = 0;
    this.state = {
      length:defaultLength,
      date:null, // indicating NOW and rolling window
      windowLengthMillis:3600*1000, // in milliseconds, one hour
      loaderState:{
        lastFileRead:null,
        lastFileBytesRead:0
      },
      visibleTS: ["LeqA", "Leq40Hz", "Leq50Hz", "Leq63Hz", "Leq80Hz", "Leq100Hz"],
      aggregatePast: true,
      startTime: new Date(),
      time: new Date(),
      events: new Array(0),
      minValue:NaN,
      maxValue:NaN,
      storageConnectionStatus:"n/a",
      //https:false,
      //serverAddress:"192.168.188.20",
      //port:3000,
      https:true,
      serverAddress:"gr4per-nms.azurewebsites.net",
      port:443,
      uiState:{status:"auto",message:"loading..."}
    };
    let storedVisibleTS = localStorage.getItem("visibleTS");
    if(storedVisibleTS)
      this.state.visibleTS = JSON.parse(storedVisibleTS);
    
    let storedAggregatePast = localStorage.getItem("aggregatePast");
    console.log("storedAggregatePast = "  + storedAggregatePast + ", === undefined: " + (storedAggregatePast === undefined) + ", false: " + (""+storedAggregatePast == "false"));
    if((""+storedAggregatePast == "false") && !(storedAggregatePast === undefined))
      this.state.aggregatePast = false;
    this.dataWindow = new NMDataWindow(new Date(), defaultLength,{},this.state.visibleTS, this.state.aggregatePast);    
    this.state.dataWindow = this.dataWindow.state;
  }

  zeroPad(str,digits) {
    str = ""+str;
    while(str.length < digits) {
      str = "0"+str;
    }
    return str;
  }
  
  getFileName(time) {
    return time.toISOString().substring(0,4)+"/"+this.zeroPad(time.getUTCMonth()+1,2)+"/"+this.zeroPad(time.getUTCDate(),2)+"/"+this.zeroPad(time.getUTCHours(),2)+".csv";
  }
  
  getNewEvents = async () => {
    
    console.log("getting new events...");
    await this.updateDataWindow(this.state.loaderState.lastFileRead, this.state.loaderState.lastBytesRead);
    return;
    
  };


  async setWindowDuration(value) {
    console.log("setWindowDuration: " + JSON.stringify(value));
    if(!value) {
      console.log("window length not passed.");
      return;
    }
    let windowLengthMillis = parseInt(value.value);
    if(value == this.state.windowLengthMillis) {
      console.log("window length unchanged.");
      return;
    }
    if(this.state.dataWindow.type == "rolling" && windowLengthMillis > 7200000) {
      console.log("rolling window cannot be > 2 hrs for rolling window.");
      let changed = this.state.windowLengthMillis != windowLengthMillis;
      windowLengthMillis = 7200000;
      if(!changed) return;
    }
    this.setState((ps)=> {
      ps.windowLengthMillis = windowLengthMillis;
      ps.uiState.status = "auto";
      ps.uiState.message = "Loading data...";
      return ps;
    });

    await this.initializeDataWindow(this.remoteConfig, this.state.date, windowLengthMillis);
    
  }
  
  async setTimeRange(date) {
    if(date != null) {
      if(this.state.date != null && date.getTime() == this.state.date.getTime()) {
        console.log("date unchanged, no update, window stays fix");
        return;
      }
    }
    else if(date == null && this.state.date == null ) {
      console.log("date unchanged, no update. windows stays rolling");
      return;
    }
    console.log("new timerange selected: " + date);
    let windowLengthMillis = this.state.windowLengthMillis;
    if(date == null) {
      console.log("setting window to rolling");
      if(windowLengthMillis > 7200000) {
        windowLengthMillis = 7200000;
        console.log("shortening window length to 2 hours");
      }
    }
    this.setState((ps)=> {
      ps.date = date;
      ps.windowLengthMillis = windowLengthMillis;
      ps.uiState.status = "auto";
      ps.uiState.message = "Loading data...";
      return ps;
    });

    await this.initializeDataWindow(this.remoteConfig, date, windowLengthMillis);
  }
  
  toggleSettings() {
    if(this.state.uiState.status == "auto") {
      console.log("cannot toggle menu in auto state");
      return;
    }
    else if(this.state.uiState.status == "modal") {
      console.log("uiState already modal: " + this.state.uiState.modal);
      return;
    }
    this.setState(ps=> {
      ps.uiState.status = "modal";
      ps.uiState.modal = "settings";
      ps.uiState.modalCallback = this.applySettings.bind(this);
      return ps;
    });
  }
  
  async applySettings(settings) {
    console.log("applying new settings: " + JSON.stringify(settings));
    let oldStorageConnectionString = localStorage.getItem("storageConnectionString");
    if(settings.storageConnectionString != oldStorageConnectionString){
      console.log("storageConnectionString changed.");
      await this.connectToStorage(settings.storageConnectionString);
      console.log("reloading page...");
      window.location.reload(false);
      return;
    }
    // now apply updated band settings
    let newBands = [];
    for(let nb of settings.visibleTS) {
      if(this.state.visibleTS.indexOf(nb) == -1) {
        console.log("adding band " + nb);
        newBands.push(nb);
      }
    }
    for(let ob of this.state.visibleTS) {
      if(settings.visibleTS.indexOf(ob) == -1) {
        console.log("removing band " + ob);
      }
    }
    let date = this.state.date;
    let windowLengthMillis = this.state.windowLengthMillis;
    this.dataWindow.state.visibleBands = settings.visibleTS;
    this.state.visibleTS = settings.visibleTS;
    let previousAggregatePast = this.state.aggregatePast;
    this.state.aggregatePast = settings.aggregatePast;
    localStorage.setItem("visibleTS", JSON.stringify(settings.visibleTS));
    localStorage.setItem("aggregatePast", settings.aggregatePast);
    if(newBands.length > 0 || settings.aggregatePast != previousAggregatePast) {
      this.setState((ps)=> {
        ps.uiState.status = "auto";
        ps.uiState.message = "Loading data...";
        return ps;
      });

      await this.initializeDataWindow(this.remoteConfig, date, windowLengthMillis);
    }
    else {
      console.log("no additional bands, just updating state of visible bands");
    }
    this.setState((ps)=> {
      ps.visibleTS = settings.visibleTS;
      ps.aggregatePast = settings.aggregatePast;
      ps.dataWindow = this.dataWindow.state;
      ps.uiState.status = "running";
      ps.uiState.modal = null;
      return ps;
    });
  }
  
  render() {  
    const latestTime = `${this.state.time}`;

    const lineStyle = {
      "raw":{
            normal: {
                stroke: "grey",
                fill:"none",
                strokeWidth:2,
                opacity: 0.7
            }
      },
      "c5m":{
            normal: {
                stroke: "yellow",
                fill:"none",
                strokeDasharray:"10,10",
                strokeWidth:3,
                opacity: 0.7
            }
      },
      "c1h":{
            normal: {
                stroke: "green",
                fill:"none",
                strokeDasharray:"20,10",
                strokeWidth:3,
                opacity: 0.7
            }
      },
      "s5m":{
            normal: {
                stroke: "cyan",
                fill:"none",
                strokeDasharray:"5,5",
                strokeWidth:3,
                opacity: 0.7
            }
      },
      "s1h":{
            normal: {
                stroke: "lightgreen",
                fill:"none",
                strokeDasharray:"20,10",
                strokeWidth:3,
                opacity: 0.7
            }
      },
      "attn":{
            normal: {
                stroke: "white",
                fill:"none",
                strokeWidth:3,
                opacity: 0.7
            }
      }
    };
    let generateLineStyle = (tsname)=>{
      let res = {};
      res[tsname] = lineStyle.raw;
      res[tsname+"_5m"] = lineStyle["c5m"];
      res[tsname+"_1h"] = lineStyle["c1h"];
      res[tsname+"_a5m"] = lineStyle["s5m"];
      res[tsname+"_a1h"] = lineStyle["s1h"];
      res[tsname+"_attn"] = lineStyle["attn"];
      //console.log("returning line style map: " + JSON.stringify(res));
      return res;
    }
    let mapColor = (color) => {
      return color == "green" ? "green" : color == "yellow" ? "yellow" : color == "orange" ? "orange" : color == "red" ? "red" : color == "black" ? "purple": "blue";
    };
    let trafficLightEventStyleCB = (event, state) => {
      const color = mapColor(event.get("color"))
      switch (state) {
          case "normal":
              return {
                  fill: color
              };
          case "hover":
              return {
                  fill: color,
                  opacity: 0.4
              };
          case "selected":
              return {
                  fill: color
              };
      }
    }

    if(this.state.storageConnectionStatus == "n/a" || this.state.storageConnectionStatus == "error") {
      return <StorageConnectionModal message={this.state.storageConnectionMessage} status={this.state.storageConnectionStatus} onSubmit={this.connectToStorage.bind(this)}/>
    }
    
   
    const eventSeries = new TimeSeries({ name: "raw", events: this.dataWindow.events });
    //console.log("this.state.dataWindow: " + JSON.stringify(this.state.dataWindow));
    const timeRange = new TimeRange(this.state.dataWindow.windowStartTime, this.state.dataWindow.windowEndTime);
    
    const dateStyle = {
        fontSize: 12,
        color: "#AAA",
        borderWidth: 1,
        borderColor: "#F4F4F4"
    };

    const ymin = this.state.minValue;
    const ymax = this.state.maxValue;
    //console.log("ymin = " + ymin + ", ymax = " + ymax)
    let mostRecentEvent = eventSeries.atLast()?eventSeries.atLast():null;
    const chartHeight = Math.max(150,this.state.height-120);    
    let trafficLightHeight = chartHeight/this.state.visibleTS.length;
    let trafficLightWidth = Math.min(trafficLightHeight, 300);
    let renderTime = new Date();
    let chartContainer = <ChartContainer timeRange={timeRange} width={this.state.width-trafficLightWidth}>
                              {this.state.visibleTS.map((el, idx)=> {
                                //console.log("mapping thresholdEvents[" + el + "] to TimeRange Series, data = " + this.dataWindow.thresholdEvents[el]);
                                let rowMin = isNaN(this.state.dataWindow.min[el])?25:this.state.dataWindow.min[el];
                                let rowMax = isNaN(this.state.dataWindow.max[el])?100:this.state.dataWindow.max[el];
                                let threshold = this.dataWindow.thresholds[el.substring(3,el.length)];
                                let overhead = 5;
                                if(threshold && rowMax < threshold+overhead) rowMax = threshold+overhead;
                                let axis = <YAxis
                                        id="y"
                                        label={el}
                                        min={rowMin}
                                        max={rowMax}
                                        width="70"
                                        type="linear"
                                        format=".2f"
                                        showGrid={true}
                                    />;
                                return <ChartRow key={"cr_"+el} height={trafficLightHeight}>
                                  <YAxis
                                        id="attn"
                                        label="Attenuation"
                                        min={-20}
                                        max={5}
                                        width="70"
                                        type="linear"
                                        format=".2f"
                                        showGrid={true}
                                    />
                                    {axis}
                                    <Charts>
                                      <LineChart style={generateLineStyle(el)} columns={(this.state.aggregatePast || this.dataWindow.state.type=="fix")?[el,el+"_a5m",el+"_a1h"]:[el,el+"_5m",el+"_1h"]} axis="y" series={eventSeries} interpolation="curveLinear"/>
                                      <LineChart style={generateLineStyle(el)} columns={[el+"_attn"]} axis="attn" series={eventSeries} interpolation="curveLinear"/>
                                      <Baseline axis="y" style={{line:{strokeWidth:2,stroke:"red"},label:{fill:"red"}}} value={threshold} label="Threshold" />
                                      <EventChart size={10} style={trafficLightEventStyleCB} series={
                                          new TimeSeries({ 
                                            name: "trafficLightEvents", 
                                            events: (this.dataWindow.thresholdEvents[el] && this.dataWindow.thresholdEvents[el].length > 0)?this.dataWindow.thresholdEvents[el].map(e=>{
                                              return new TimeRangeEvent(
                                                new TimeRange(e.startTime, e.endTime), 
                                                {color:e.color,leq:e.leq}
                                              )
                                            }):[]
                                          })
                                        } label={e => {return ""+e.get("leq") + "dB";}} />
                                    </Charts>
                                </ChartRow>;
                                })
                              }
                            </ChartContainer>;

    let result =<div>
                <GlassPane applySettings={this.applySettings.bind(this)} settings={{storageConnectionString:localStorage.getItem("storageConnectionString"),visibleTS:this.state.visibleTS.slice(0, this.state.visibleTS.length),thresholds:this.dataWindow.thresholds,aggregatePast:this.state.aggregatePast}} uiState={this.state.uiState} style={{color:"white",backgroundColor:"grey"}}/>
                <div className="row">
                    <div className="col-md-8">
                        <span style={dateStyle}>Noise Monitoring Client {new Date().toString()}, gr4per solutions</span>
                    </div>
                    <div className="col-md-8">
                        <div style={{"display":"flex","flexDirection":"row","justifyContent":"space-between","width":"100%","fontSize":"32pt","color":"white"}}>
                          <div>{this.remoteConfig?this.remoteConfig.venue:"Unknown venue"} {this.remoteConfig?this.remoteConfig.position:"Unknown position"}</div>
                          <div style={{display:"flex",flexDirection:"row"}}>
                            <div style={{"backgroundColor":"inherit", "display":"flex","flexDirection":"column","justifyContent":"space-around"}}><Select styles={customSelectStyles} onChange={this.setWindowDuration.bind(this)} defaultValue={windowDurationOptions[0]} value={windowDurationOptions.find(el=>{ return el.value == this.state.windowLengthMillis;})} options={windowDurationOptions}/></div>
                            <div style={{"backgroundColor":"inherit", "display":"flex","justifyContent":"space-around"}}><DatePicker filterDate={(d)=>{return d.getTime() < new Date().getTime()}} dateFormat="yy/MM/d HH:mm" showTimeSelect placeholderText="NOW" isClearable={true} selected={this.state.date} onChange={this.setTimeRange.bind(this)}/></div>
                            <div style={{"display":"flex", "flexDirection":"column", "justifyContent":"space-around"}}>
                              <div onClick={this.toggleSettings.bind(this)} style={{paddingLeft:"8px",paddingRight:"8px",height:"36px",fontSize:"24px", marginLeft:"5px",fontWeight:"bold", color:"black", backgroundColor:"white"}}>{"\u2261"}</div>
                            </div>
                          </div>
                        </div>
                    </div>
                </div>
                <hr />
                <div className="row">
                    <div className="col-md-12">
                        <Resizable>
                          <div style={{display:"flex",flexDirection:"row", width:"100%"}}>
                            {chartContainer}
                            <div style={{display:"flex",flexDirection:"column"}}>
                              {this.state.visibleTS.map((el, idx)=> {
                                let rowMin = isNaN(this.state.dataWindow.min[el])?25:this.state.dataWindow.min[el];
                                let rowMax = isNaN(this.state.dataWindow.max[el])?100:this.state.dataWindow.max[el];
                                if(el == "LeqA")console.log("LeqA_min = " + rowMin + ", max = " + rowMax);
                                let lastRowEvent = this.dataWindow.events.length > 0? this.dataWindow.events[this.dataWindow.events.length-1].toJSON():null;
                                let bandLimit = this.dataWindow.thresholds[el.substring(3,el.length)];
                                let bandValue = "";
                                let bandValue5m = "";
                                let bandValue1h = "";
                                let bandMax5m = "";
                                let bandMax1h = "";
                                let attn = null;
                                if(lastRowEvent) {
                                  bandValue = ""+lastRowEvent.data[el];
                                  bandValue5m = ""+(this.state.dataWindow.type == "rolling"?lastRowEvent.data[el+"_5m"]:lastRowEvent.data[el+"_a5m"]);
                                  bandValue1h = ""+(this.state.dataWindow.type == "rolling"?lastRowEvent.data[el+"_1h"]:lastRowEvent.data[el+"_a1h"]);
                                  bandMax5m = isNaN(this.state.dataWindow.max[el+"_5m"])?100:this.state.dataWindow.max[el+"_5m"];
                                  bandMax1h = isNaN(this.state.dataWindow.max[el+"_1h"])?100:this.state.dataWindow.max[el+"_1h"];
                                  attn = lastRowEvent.data[el+"_attn"];
                                  if(attn) attn = Math.floor(parseFloat(attn)*10)/10.0;
                                }
                                if(bandValue.indexOf(".") >-1) {
                                  if(bandValue.length > bandValue.indexOf(".")+2){
                                    bandValue = bandValue.substring(0,Math.min(bandValue.indexOf(".")+2));
                                  }
                                }
                                else {
                                  bandValue += ".0";
                                }

                                bandValue5m = formatFloat(bandValue5m);
                                bandValue1h = formatFloat(bandValue1h);
                                bandMax5m = formatFloat(bandMax5m);
                                bandMax1h = formatFloat(bandMax1h);

                                return <div key={"trafficLight_"+el} style={{position:"relative",width:trafficLightWidth, height:trafficLightHeight,backgroundColor:(this.dataWindow.thresholdEvents[el]&&this.dataWindow.thresholdEvents[el].length>0)?mapColor(this.dataWindow.thresholdEvents[el][this.dataWindow.thresholdEvents[el].length-1].color):"black"}}>
                                  <div style={{position:"relative",fontSize:""+(trafficLightWidth/6)+"px"}}>{el.replace(/_/g,".")}</div>
                                    {this.state.dataWindow.type == "rolling"?<div style={{position:"relative",fontSize:""+(trafficLightWidth/6)+"px"}}>{"1s "+ bandValue + " dB"}</div>:null}
                                    {(attn == null || attn == 0)?"":<div style={{position:"relative",fontSize:""+(trafficLightWidth/8)+"px"}}>{"Attn " + attn + " dB"}</div>}
                                  <div style={{position:"relative",fontSize:""+(trafficLightWidth/8)+"px"}}>{"5m " + (this.state.dataWindow.type == "rolling"?"":"max ") + (this.state.dataWindow.type == "rolling"?bandValue5m:bandMax5m) + " dB"}</div>
                                    {(this.state.dataWindow.type == "rolling")?<div style={{position:"relative",fontSize:""+(trafficLightWidth/8)+"px"}}>{"1h " + bandValue1h + " dB"}</div>:""}
                                  <div style={{position:"relative",fontSize:""+(trafficLightWidth/8)+"px"}}>{"1h max " + bandMax1h + " dB"}</div>
                                  {bandLimit?<div style={{position:"relative",fontSize:""+(trafficLightWidth/8)+"px"}}>{"1h limit " + bandLimit + " dB"}</div>:""}
                                  <div style={{position:"absolute",width:"10px",backgroundColor:"rgba(40,40,40,0.8)",right:"0px",bottom:"0px",height:""+(trafficLightHeight*(((lastRowEvent?lastRowEvent.data[el]:0)-rowMin)/(rowMax-rowMin)))+"px"}}/>
                                  <div style={{position:"absolute",height:"5px",width:trafficLightWidth,backgroundColor:"black",bottom:"0px"}}/>                                  
                                </div>
                              })}
                            </div>
                          </div>
                        </Resizable>
                    </div>
                </div>
            </div>;
    //console.log("rendered: ", result);
    return result;
  }  

  componentDidUpdate(prevProps) {
    ;
  }
  
  
  async connectToStorage(newConnStr) {
    if(newConnStr) {
      console.log("storing new connectionString");
      localStorage.setItem("storageConnectionString", newConnStr);
    }
    else {
      newConnStr = localStorage.getItem("storageConnectionString");
      if(newConnStr) {
        console.log("retrieved connectionString from cache");
      }
      else {
        console.log("no connection string in cache");
      }
    }
    if(!newConnStr) {
      this.setState((ps)=>{
        ps.storageConnectionStatus = "n/a";
        return ps;
      });
      return;
    }
    else {
      let nmdId = null;
      try {
        nmdId = newConnStr.substring(newConnStr.indexOf("net/")+4,newConnStr.indexOf("?"));
        console.log("parsed nmdId from storage connection string: " + nmdId);
        this.setState((ps)=>{
          ps.nmdId = nmdId;
          ps.apiToken = newConnStr;
          return ps;
        });
      }
      catch(e) {
        console.error("couldnt parse nmdId from storage connection string:", e);
        this.setState((ps)=>{
          ps.storageConnectionStatus = "n/a";
          return ps;
        });
        return;
      }
    }
    let blobServiceClient = null;
    try {
      console.log("opening connection to storage...");
      
      let containerClient = new ContainerClient(newConnStr);
      console.log("Successfully connected to Storage!");
      this.setState((ps)=>{
        ps.storageConnectionStatus = "up";
        ps.containerClient = containerClient;
        return ps;
      });
    }
    catch(e) {
      this.setState((ps)=>{
        ps.storageConnectionStatus = "error";
        ps.storageConnectionMessage = "" + e;
        return ps;
      });
    }
  }
  
  async initializeDataWindow(remoteConfig, startTime, lengthMillis) {
    let length = lengthMillis/1000;
    let windowEndTime = startTime?new Date(startTime.getTime()+lengthMillis):new Date();
    let windowStartTime = startTime?startTime:new Date(windowEndTime.getTime()-lengthMillis);
    console.log("init window, setting length = " + length + " to cover time " + windowStartTime + " - " + windowEndTime);
    let dataWindowThresholds = {};
    Object.keys(remoteConfig.bandConfig).map((el,idx)=>{dataWindowThresholds[el.replace(/\./g,"_")] = remoteConfig.bandConfig[el].limit1h;});
    console.log("initializeDataWindow:  dataWindowThresholds = " + JSON.stringify(dataWindowThresholds));
    this.dataWindow = new NMDataWindow(startTime, length, dataWindowThresholds, this.state.visibleTS, this.state.aggregatePast);
    this.setState((ps)=> {
      ps.dataWindow = this.dataWindow.state;
      return ps;
    });
    await this.updateDataWindow(null, 0);
  }
  
  async getDataResponse(currentBlobClient, currentFileName, offset) {
    let readFile = true;
    //let res = await currentBlobClient.exists();
    //console.log("exists: " + JSON.stringify(res,null,2));
    console.log("attempting to download '" + currentFileName + "'");
    let blobResponse = null;
    try {
      console.log("downloading " + currentFileName);
      blobResponse = await currentBlobClient.download(offset);
    }
    catch(e) {
      if(e.statusCode == "416") {
        console.log("no new data yet");
        this.updating = false;
        throw e;
      }
      else if(e.statusCode == "409") {
        console.log("blob modified while being read");
        this.updating = false;
        throw e;
      }
      else if(e.statusCode == "404") {
        console.log("blob not existing");
        readFile = false;
        return "";
      }
      else {
        console.log("download failed: " + JSON.stringify(e));
        throw e;
      }
    }
    let data = "";
    if(readFile) {
      //console.log("response: '" + JSON.stringify(blobResponse) + "'");
      let body = await blobResponse.blobBody;
      const fileReader = new FileReader();
      data = await new Promise((resolve, reject) => {
        fileReader.onloadend = (ev) => {
          resolve(ev.target.result);
        };
        fileReader.onerror = reject;
        fileReader.readAsText(body);
      });
      console.log("downloaded " + currentFileName + ", " + data.length + " bytes");
      // now add the data to window
      //console.log("data: " + data);
      return data;
    }
    return "";
  }
  
  /**
   * cfn - currentFileName, if not set will be derived from window start time, if set will be the file for next read
   * bytesRead - bytes that have already been consumed from currentFile
   */
  async updateDataWindow(cfn, bytesRead) {
    if(this.updating) {console.log("skipping update window, update in progress");return;}
    this.updating = true;
    let currentFileName = cfn;
    let currentStartTime = this.dataWindow.state.windowStartTime;
    console.log("updateDataWindow: currentStartTime = " + currentStartTime + ", type = " + this.dataWindow.state.type + ", aggregatePast = " + this.state.aggregatePast);
    if(currentFileName) currentStartTime = new Date(currentFileName.substring(0,10).replace(/\//g,'-')+"T"+currentFileName.substring(11,13)+":00:00.000Z");
    let data = null;
    let events = []; // these are pondjs time events
    let dataResponses = [];
    while( (this.state.aggregatePast || this.dataWindow.state.type == "fix") && currentStartTime.getTime() < this.dataWindow.state.windowEndTime) {
      // open next fileCreatedDate
      currentFileName = this.getFileName(currentStartTime);
      let currentBlobClient = await this.state.containerClient.getBlobClient(currentFileName);
      dataResponses.push(this.getDataResponse(currentBlobClient, currentFileName, currentFileName==cfn?bytesRead:0));
      // set to next full hour
      console.log("currentStartTime = " + currentStartTime + ", forwarding to next full hour");
      currentStartTime = new Date(Math.floor(currentStartTime.getTime()/3600/1000)*3600*1000+3600*1000);
      console.log("currentStartTime now " + currentStartTime);
    }
    
    let results = null;
    try {
      results = await Promise.all(dataResponses);
    }
    catch(e) {
      console.error("parallel download error: ", e);
      this.updating = false;
      return;
    }
    for(let r of results) {
      //console.log("iterating parallel download element '" + r + "'");
      if(r.length > 0) {
        this.dataWindow.addDataToEvents(r,events);
        console.log("after applying " + currentFileName + " data, eventBuffer with new events now " + events.length + " entries long");
      }
    }
    
    this.setState((ps)=> {
      ps.loaderState.lastBytesRead = (currentFileName==cfn?bytesRead:0)+data?data.length:0;
      ps.loaderState.lastFileRead = currentFileName;
      return ps;
    });
    let newState = null;
    try {
      newState = this.dataWindow.addEvents(events);
    }
    catch(e) {
      console.error("error adding events. stopping: ", e);
      clearInterval(this.interval);
      clearTimeout(this.timeout);
      this.setState((ps)=> {
        ps.nmdId = null;
        return ps;
      });
    }

    if(newState) {
      this.setState((ps)=> {
        ps.dataWindow = newState;
        console.log("updating dataWindow to new state after event addition");
        ps.uiState.status = "running";
        ps.uiState.message = "";
        ps.uiState.gameStatus == "running";
        return ps;
      });
    }
    else {
      console.log("data window state not changed by addEvents, skipping state update");
    }
    
    this.updating = false;
  }
  
  async blobToString(blob) {
    const fileReader = new FileReader();
    return new Promise((resolve, reject) => {
      fileReader.onloadend = (ev) => {
        resolve(ev.target.result);
      };
      fileReader.onerror = reject;
      fileReader.readAsText(blob);
    });
  }
  
  async readBlob(fileName, offset = 0) {
    let blobClient = await this.state.containerClient.getBlobClient(fileName);
    let blobResponse = null;
    let downloaded = null;
    try {
      console.log("downloading " + fileName);
      let blobResponse = await blobClient.download(fileName, offset);
      downloaded = await this.blobToString(await blobResponse.blobBody);
    }
    catch(e) {
      if(e.statusCode == "416") {
        console.log("" + fileName + " download failed: byte range invalid");
        return null;
      }
      else if(e.statusCode == "409") {
        console.log("" + fileName + " download failed: blob modified while reading");
        return null;
      }
      else if(e.statusCode == "404") {
        console.log("" + fileName + " download failed: blob not found");
        return null;
      }
      else {
        console.log("download failed: ", e);
        return null;
      }
    }
    return downloaded;
  }
  
  async componentDidMount() {
    this.updateWindowDimensions();
    
    window.addEventListener('resize', this.updateWindowDimensions);
    
    await this.connectToStorage();
    console.log("storage connected, now loading initial data");
    
    // update remote config
    let remoteConfig = await this.readBlob("remoteConfig.json");
    if(!remoteConfig) {
      console.error("remoteConfig.json not found, aborting.");
      return;
    }
    this.remoteConfig = JSON.parse(remoteConfig);
    
    await this.initializeDataWindow(this.remoteConfig, null, 3600*1000);
    console.log("data winodw loaded. nmdId = " + this.state.nmdId + ". initializing NMS websocket keep-alive...");
    
    const increment = sec;
    
    if(!this.state.updatePaused) {
      this.interval = setInterval(async ()=>{
        if(this.nmdClient) { 
          if( (new Date().getTime() - this.lastPing.getTime()) > 5000) {
            console.log("" + new Date() + ": found stale server connection not pinged since " + this.lastPing + ", leaving, then resetting nmdClient and scheduling reconnect...");
            this.sendRemoteCommand({command:"leave",params:[false]});           
            this.nmdClient.close();
            this.nmdClient = null;
            if(this.state.nmdId) {
              console.log("setting timer for reconnect attempt...");
              try {
                clearTimeout(this.timeout);
              }
              catch(e) {}
              this.timeout = setTimeout(this.joinNMS.bind(this, this.state.nmdId),1000);
            }
            return;
          }
          else if(this.nmdClient.readyState == 1){ // SOCKET is open
            console.log("sending ping to server");
            this.sendRemoteCommand({command:"clientPing",params:[]});
          }
          else {
            console.log("ping skipped, socket state = " + this.nmdClient.readyState);
          }
        }
        else {
          this.nmdClient = null;
          if(this.state.nmdId) {
            try {
              clearTimeout(this.timeout);
            }
            catch(e){}
            console.log("no nmd client, setting time out to re connect to nmd " + this.state.nmdId ,true);
            // find out whether the game exists on server
            this.timeout = setTimeout(this.joinNMS.bind(this, this.state.nmdId),1000);
          }
        }
      },2000);
    }
  }

  componentWillUnmount() {
    clearInterval(this.interval);
    window.removeEventListener('resize', this.updateWindowDimensions);
  }
  
  updateWindowDimensions() {
    let newState = { width: window.innerWidth, height: window.innerHeight };
    this.setState(newState);
    //console.log("updateWindowDimensions: width=" + newState.width + ", height=" + newState.height);
  }
  
  sendRemoteCommand(cmdJson) {
    if(this.nmdClient) {
      try {
        this.nmdClient.send(JSON.stringify(cmdJson));
      }
      catch(e) {
        console.error(e);
      }
    }
    else {
      console.error("cannot send command " + cmdJson.command + " to server: no nms client");
    }
  }

  async joinNMS(nmdId) {
    console.log("joinNMS called, retry = " + (this.retry+1));
    if(!nmdId) {
      console.log("need both nmdId to join NMS.");
      return;
    }
    if(this.state.joinTime && new Date().getTime()-this.state.joinTime < 5000) {
      console.log("previous join attempt not timed out, skipping...");
      return;
    }
    this.state.joinTime = new Date();
    console.log("trying to join NMS " + nmdId + "...");
    this.retry++;
    this.setState(ps=> {
      ps.nmdId = nmdId;
      ps.uiState.status = "auto";
      ps.uiState.gameStatus = "joining";
      ps.uiState.message = "joining nms...";
      return ps;
    });
    let successfulJoin = false;
    console.log("join NMS called, nmdId = " + nmdId);
    try {
      this.nmdClient = new WebSocket('ws'+(this.state.https?"s":"")+'://'+this.state.serverAddress+':'+this.state.port+'/api/nmds/' + nmdId + '/join?token=' + this.state.apiToken+ "&mode=sink");
    }
    catch(err) {
      console.error(err);
    }
    this.nmdClient.onerror = (event) => {
      console.log("nmdClient error: ", event);
    }
    
    this.lastPing = new Date(); // start with stale date
    console.log("" + new Date + ": created ws");
    this.nmdClient.onopen = (event) => {
      //console.log("event = " + JSON.stringify(event));
      console.log("" + new Date() + ": webSocket successfully opened, adding ping/pong timer");
      this.lastPing = new Date(); // start with stale date
      this.retry = 0;
    };
    this.nmdClient.onmessage = (messageEvent) => {
      this.lastPing = new Date(); // start with stale date
      let message = messageEvent.data;
      let messageObj = null;
      try {
        messageObj = JSON.parse(message);
      }
      catch(e) {
        // treat as data rows
        if(message.indexOf("\t") < 20) {
          messageObj = {command:"newData",params:[message]};
        }
        else {
          console.error("could not parse NMS message: '" + message + "'",e);
        }
      }
      let trace = true;
      if(messageObj.command) {
        //console.log("received server command on gameClient[" + this.gameClientId + "]: " + JSON.stringify(messageObj));
        //console.log("received server command: " + messageObj.command);
        switch(messageObj.command) {
          case "id":
            this.nmdClientId = messageObj.params[0];
            this.serverVersion = messageObj.params[1];
            successfulJoin = true;
            break;
          case "newData":
            console.log("received new data from NMS");//: " + messageObj.params[0]);
            let events = [];
            if(this.state.dataWindow.status == "loaded") {
              let eventsLength = events.length;
              this.dataWindow.addDataToEvents(messageObj.params[0], events);
              if(eventsLength != events.length) {
                let newState = this.dataWindow.addEvents(events);
                this.setState((ps)=> {
                  ps.dataWindow = newState;
                  return ps;
                });
              }
            }
            break;
          case "pong":
            //console.log("" + new Date() + ": received pong, updating lastPing");
            this.lastPing = new Date();
            break;
          default:
            console.log("command not implemented",true);
        }
      }
      else if(messageObj.error) {
        console.log("received server error message: " + messageObj.error);
        console.log("received server error!");
        this.setState(ps=> {
          ps.uiState.status = "running";
          ps.uiState.message = null;
          ps.uiState.modal="message";
          ps.uiState.modalParam="Server error: " + messageObj.error;
          return ps;
        });
        return;
      }
      else {
        console.error("received unexpected data: " + message);
        return;
      }
    };
    let timeout = 5000;
    let startTime = new Date().getTime();
    while(!successfulJoin && new Date().getTime() - startTime < timeout) {
      await sleep(100);
    }
    if(successfulJoin) {
      console.log("joined nmd successfully, setting nmdId!");
      this.setState(ps=> {
        ps.uiState.status = "running";
        ps.uiState.message = null;
        ps.nmdId = nmdId;
        return ps;
      });
      if(this.state.dataWindow.status == "loaded" && this.state.dataWindow.type =="rolling") {
        let syncStart = this.dataWindow.getNewestDateStr();
        console.log("sending sync command to NMS to start sending data for rolling window from " + syncStart);
        this.sendRemoteCommand({command:"sync",params:[syncStart]});
      }
      else {
        console.log("skip asking NMS to sync data since state is not loaded AND rolling");
      }
    }
  }  
}