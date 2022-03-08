import React, { Component} from "react";
import {ContainerClient, BlobCorsRule} from "@azure/storage-blob";
import Ring from "ringjs";
import StorageConnectionModal from "./StorageConnectionModal.js";
let debug = true;
let rcl = console.log;
console.log = function() {
  if(debug) rcl.apply(null,arguments);
}
import {
    TimeSeries,
    TimeRange,
    TimeEvent,
    avg
} from "pondjs";

import {
  ChartContainer, 
  ChartRow, 
  Charts, 
  YAxis, 
  LineChart,
  ScatterChart, 
  BarChart, 
  Resizable, 
  Legend, 
  styler} from "react-timeseries-charts";

const sec = 1000;
const minute = 60 * sec;
const hours = 60 * minute;
const rate = 1000;
const dataLabels = ["Time","RcvTime","LeqA","LeqB","LeqC","LeqZ","Leq6.3Hz","Leq8Hz","Leq10Hz","Leq12.5Hz","Leq16Hz","Leq20Hz","Leq25Hz","Leq31.5Hz","Leq40Hz","Leq50Hz","Leq63Hz","Leq80Hz","Leq100Hz","Leq125Hz","Leq160Hz","Leq200Hz","Leq250Hz","Leq315Hz","Leq400Hz","Leq500Hz","Leq630Hz","Leq800Hz","Leq1kHz","Leq1.25kHz","Leq1.6kHz","Leq2kHz","Leq2.5kHz","Leq3.15kHz","Leq4kHz","Leq5kHz","Leq6.3kHz","Leq8kHz","Leq10kHz","Leq12.5kHz","Leq16kHz","Leq20kHz"];
const length5msecs = 300;
const length1hsecs = 3600;
  
function sleep(millis) {
  return new Promise(resolve => setTimeout(resolve, millis));
}

// based on https://software.es.net/react-timeseries-charts/#/example/realtime

export default class NMC extends React.Component {  

  state = {
        dataWindow:{
          type:"rolling",
          length:3600,
          lastFileRead:null,
          lastFileBytesRead:0,
          maxY:100.0,
          minY:20.0,
          dataStatus:"new",
          windowStartTime:new Date(new Date().getTime()-3600*1000),
          windowEndTime:new Date()
        },
        visibleTS: ["LeqA", "Leq40Hz", "Leq50Hz", "Leq63Hz"],
        startTime: new Date(),
        time: new Date(),
        events: new Array(0),
        minValue:NaN,
        maxValue:NaN,
        storageConnectionStatus:"n/a",
        https:false,
        serverAddress:"192.168.188.20",
        port:3000,
        retry:0,
        uiState:{}
  };

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
    await this.updateDataWindow(this.state.dataWindow.lastFileRead, this.state.dataWindow.lastBytesRead);
    return;
    
  };

  constructor(props) {
    super(props);
    this.version = "1.1.4";
    this.updateWindowDimensions = this.updateWindowDimensions.bind(this);
  }    
  
  render() {  
    const latestTime = `${this.state.time}`;

    const lineStyle = {
      "raw":{
            normal: {
                stroke: "gold",
                fill:"none",
                strokeWidth:3,
                opacity: 0.7
            }
      },
      "c5m":{
            normal: {
                stroke: "gold",
                fill:"none",
                strokeDasharray:"10,10",
                strokeWidth:3,
                opacity: 0.7
            }
      },
      "c1h":{
            normal: {
                stroke: "gold",
                fill:"none",
                strokeDasharray:"20,10",
                strokeWidth:3,
                opacity: 0.7
            }
      },
      "s5m":{
            normal: {
                stroke: "red",
                fill:"none",
                strokeDasharray:"10,10",
                strokeWidth:3,
                opacity: 0.7
            }
      },
      "s1h":{
            normal: {
                stroke: "red",
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
    

    if(this.state.storageConnectionStatus == "n/a" || this.state.storageConnectionStatus == "error") {
      return <StorageConnectionModal message={this.state.storageConnectionMessage} status={this.state.storageConnectionStatus} onSubmit={this.connectToStorage.bind(this)}/>
    }
    
   
    const eventSeries = new TimeSeries({ name: "raw", events: this.state.events });
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

    let chartContainer = <ChartContainer timeRange={timeRange}>
                              {this.state.visibleTS.map((el, idx)=> {
                                return <ChartRow key={"cr_"+el} height={chartHeight/this.state.visibleTS.length}>
                                    <YAxis
                                        id="y"
                                        label={el}
                                        min={isNaN(this.state.minValue)?25:this.state.minValue}
                                        max={isNaN(this.state.maxValue)?100:this.state.maxValue}
                                        width="70"
                                        type="linear"
                                        format=".2f"
                                        showGrid={true}
                                    />
                                    <Charts>
                                      <LineChart style={generateLineStyle(el)} columns={[el,el+"_5m",el+"_a5m"]} axis="y" series={eventSeries} interpolation="curveLinear"/>
                                    </Charts>
                                </ChartRow>;
                                })
                              }
                            </ChartContainer>;

    let result =<div>
                <div className="row">
                    <div className="col-md-8">
                        <span style={dateStyle}>{new Date().toString()}</span>
                    </div>
                    <div className="col-md-8">
                        <div style={{"display":"flex","width":"100%","fontSize":"32pt","color":"white"}}>
                        Noise Monitoring Client 
                        </div>
                    </div>
                </div>
                <hr />
                <div className="row">
                    <div className="col-md-12">
                        <Resizable>{chartContainer}
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
  
  applyDataLineToWindow(eventBuffer, t, line) {
    let l = line.split("\t");
    let dataMap = {ee:{}}
    for(let i = 2;i < dataLabels.length;i++) {
      let label = dataLabels[i];
      dataMap[label] = l[i];
      dataMap[label+"_a5m"] = l[i+dataLabels.length];
      dataMap[label+"_a1h"] = l[i+dataLabels.length*2];
      dataMap[label+"_attn"] = l[i+dataLabels.length*3];
      dataMap.ee[label] = Math.pow(10,parseFloat(l[i])/10.0);
    }
    //{"LeqA":l[2],"LeqB":l[3],"LeqC":l[4],"LeqZ":l[5],"Leq6.3Hz":l[6],"Leq8Hz":l[7],"Leq10Hz":l[8],"Leq12.5Hz":l[9],"Leq16Hz":l[10],"Leq20Hz":l[11],"Leq25Hz":l[12],"Leq31.5Hz":l[13],"Leq40Hz":l[14],"Leq50Hz":l[15],"Leq63Hz":l[16],"Leq80Hz":l[17],"Leq100Hz":l[18],"Leq125Hz":l[19],"Leq160Hz":l[20],"Leq200Hz":l[21],"Leq250Hz":l[22],"Leq315Hz":l[23],"Leq400Hz":l[24],"Leq500Hz":l[25],"Leq630Hz":l[26],"Leq800Hz":l[27],"Leq1kHz":l[28],"Leq1.25kHz":l[29],"Leq1.6kHz":l[30],"Leq2kHz":l[31],"Leq2.5kHz":l[32],"Leq3.15kHz":l[33],"Leq4kHz":l[34],"Leq5kHz":l[35],"Leq6.3kHz":l[36],"Leq8kHz":l[37],"Leq10kHz":l[38],"Leq12.5kHz":l[39],"Leq16kHz":l[40],"Leq20kHz":l[41]};
    if(eventBuffer.length > 0) {
      let top = eventBuffer[eventBuffer.length-1];
      if(t.getTime() <= top.timestamp()) {
        console.error("pushing line violates ordering contract, previous line time " + top.time + ", new line " + l);
      }
    }
    eventBuffer.push(new TimeEvent(t, dataMap));
  }
  
  async initializeDataWindow() {
    let ringSize = Math.ceil( (this.state.dataWindow.windowEndTime.getTime()-this.state.dataWindow.windowStartTime.getTime())/1000 );
    console.log("init window, setting ringSize = " + ringSize + " to cover time " + this.state.dataWindow.windowStartTime + " - " + this.state.dataWindow.windowEndTime);
    await new Promise((resolve,reject)=> {
      this.setState((ps)=> {
        ps.dataWindow.status = "initializing";
        ps.dataWindow.idx5m = 0;
        ps.dataWindow.idx1h = 0;
        ps.dataWindow.ee5m = {};
        ps.dataWindow.ee1h = {};
        ps.dataWindow.nextAggregateIdx = 0;
        ps.events = new Array(); //Ring(ringSize+3600); // add one hour to calculate 1h aggregate
        resolve();
        return ps;
      });
    });
    await this.updateDataWindow(null, 0);
  }
  
  async updateDataWindow(cfn, bytesRead) {
    if(this.updating) {console.log("skipping update window, update in progress");return;}
    this.updating = true;
    let currentFileName = cfn;
    let currentStartTime = this.state.dataWindow.windowStartTime;
    if(currentFileName) currentStartTime = new Date(currentFileName.substring(0,10).replace(/\//g,'-')+"T"+currentFileName.substring(11,13)+":00:00.000Z");
    let data = null;
    let events = []; // these are pondjs time events
    while(currentStartTime.getTime() < new Date().getTime()) {
      // open next fileCreatedDate
      currentFileName = this.getFileName(currentStartTime);
      let currentBlobClient = await this.state.containerClient.getBlobClient(currentFileName);
      let readFile = true;
      //let res = await currentBlobClient.exists();
      //console.log("exists: " + JSON.stringify(res,null,2));
      console.log("attempting to download '" + currentFileName + "'");
      let blobResponse = null;
      try {
        console.log("downloading " + currentFileName);
        blobResponse = await currentBlobClient.download(currentFileName==cfn?bytesRead:0);
      }
      catch(e) {
        if(e.statusCode == "416") {
          console.log("no new data yet");
          this.updating = false;
          return;
        }
        else if(e.statusCode == "409") {
          console.log("blob modified while being read");
          this.updating = false;
          return;
        }
        else if(e.statusCode == "404") {
          console.log("blob not existing");
          readFile = false;
        }
        else {
          console.log("download failed: " + JSON.stringify(e));
          break;
        }
      }
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
        this.addDataToEvents(data,events);
        console.log("after applying " + currentFileName + " data, eventBuffer with new events now " + events.length + " entries long");
      }
      // set to next full hour
      console.log("currentStartTime = " + currentStartTime + ", forwarding to next full hour");
      currentStartTime = new Date(Math.floor(currentStartTime.getTime()/3600/1000)*3600*1000+3600*1000);
      console.log("currentStartTime now " + currentStartTime);
    }
    this.setState((ps)=> {
      ps.dataWindow.lastBytesRead = (currentFileName==cfn?bytesRead:0)+data.length;
      ps.dataWindow.lastFileRead = currentFileName;
      return ps;
    });
    this.addEvents(events);
  }
  
  addDataToEvents(data,events) {
    let lines = data.split("\r\n").filter((x)=>{return x.length > 0;});
    console.log("data has " + lines.length + " lines");
    for(let l of lines) {
      let timeStr = l.substring(0,l.indexOf("\t"));
      //console.log("line timeStr='" + timeStr + "'");
      let lineTime = new Date(timeStr+".000Z");
      //console.log("line time " + lineTime);
      if(this.state.dataWindow.type != "rolling" && lineTime.getTime() > this.state.dataWindow.windowEndTime.getTime())break;
      if(lineTime.getTime() >= this.state.dataWindow.windowStartTime.getTime()) {
        //console.log("adding line to data");
        this.applyDataLineToWindow(events, lineTime,l); // converts l, lineTime to TimeEvent including energy eqivalents
                                                        // and adds to events
      }
    }
  }
  
  addEvents(events) {
    let newestEventTime = new Date();
    if(events.length>0)newestEventTime = new Date(events[events.length-1].timestamp());
    console.log("update reached windowEnd, lastRecord time = " + newestEventTime + ", now aggregating new data");
    let newWindowEndTime = new Date(Math.floor(newestEventTime.getTime()/1000)*1000+1000);
    if(this.state.dataWindow.type == "rolling" && newWindowEndTime.getTime()+1000 < new Date().getTime()) {
      console.log("newest event in rolling window is stale " + newWindowEndTime + ", current client time = " + new Date());
      newWindowEndTime = new Date();
    }
    let newWindowStartTime = new Date(newWindowEndTime.getTime()-this.state.dataWindow.length*1000);
    
    // now aggregate the data
    let idx5m = this.state.dataWindow.idx5m;
    let idx1h = this.state.dataWindow.idx1h;
    let ee5m = this.state.dataWindow.ee5m;
    let ee1h = this.state.dataWindow.ee1h;
    
    if(events.length == 0) {
      console.log("zero new events, skipping aggregation");
    }
    else {
      // init window total energies
      if( Object.keys(this.state.dataWindow.ee5m).length == 0) {
        console.log("initializing 5m and 1h window total energies to 0.0 for all values");
        for(let i = 2; i < dataLabels.length;i++) {
          ee1h[dataLabels[i]] = ee5m[dataLabels[i]] = 0.0;
        }
      }

      events = this.state.events.concat(events);
      let prevTs = null;
      for(let i = 0;i < events.length; i++) {
        if(prevTs && events[i].timestamp() <= prevTs) {
          console.error("non chronological: i = " + i + ", prevTs = " +new Date(prevTs) + ", current = " + new Date(events[i].timestamp()));
        }
        prevTs = events[i].timestamp();
      }
      // iterate the new events and aggregate each
      let nextAggregateIdx = this.state.dataWindow.nextAggregateIdx;
      console.log("data aggregation starting at index " + (nextAggregateIdx) + " out of total " + events.length + " events");
      for(; nextAggregateIdx < events.length; nextAggregateIdx++) {
        //if(nextAggregateIdx == 10) return;
        let ts = events[nextAggregateIdx].timestamp();
        

        // slide the 5m window forward until and substract energies from now out of window events
        while(ts - events[idx5m].timestamp() > length5msecs*1000) {
          let data = events[idx5m].toJSON();
          //console.log("dropping " + idx5m + " (" + new Date(events[idx5m].timestamp()) + " from 5m window: ee5m so far: " + JSON.stringify(ee5m) + ", data.ee = " + JSON.stringify(data.data.ee));
          for(let j = 2; j < dataLabels.length;j++) {
            let lbl = dataLabels[j];
            try {
              //console.log("subtracting " + data.data.ee[lbl] + " from ee5m[" + lbl + "] = " + ee5m[lbl] + ", adding " + events[nextAggregateIdx].toJSON().data.ee[lbl]);
              ee5m[lbl] -= data.data.ee[lbl];
            }
            catch(e) {
              console.log("lbl = " + lbl + ", data = " + JSON.stringify(data) + ", ee5m = " + JSON.stringify(ee5m,null,2));
              throw e;
            }
          }
          idx5m++;            
        }
        // slide the 1h window forward until and substract energies from now out of window events
        //console.log("" + nextAggregateIdx + ": going to push idx1h  forward from " + idx1h + ", event.length = " + events.length);
        while(ts - events[idx1h].timestamp() > length1hsecs*1000) {
          //console.log("dropping " + idx1h + " (" + new Date(events[idx1h].timestamp()) + " from 1h window...");
          let data = events[idx1h].toJSON();
          for(let j = 2; j < dataLabels.length;j++) {
            let lbl = dataLabels[j];
            try {
              ee1h[lbl] -= data.data.ee[lbl];
            }
            catch(e) {
              console.log("lbl = " + lbl + ", data = " + JSON.stringify(data) + ", ee1h = " + JSON.stringify(ee1h,null,2));
              throw e;
            }
          } 
          idx1h++;  
          if(!events[idx1h]) {
            console.log("idx1h = " + idx1h + ", no event on that idx! events.length = " + events.length);
          }
        }
        // now add new energies at the top
        let newData = events[nextAggregateIdx].toJSON();
        //console.log("newData[" + nextAggregateIdx + "] = ", newData)
        let initialValue5m = {};
        let initialValue1h = {};
        for(let j = 2; j < dataLabels.length;j++) {
          initialValue5m[dataLabels[j]]=0.0;
          initialValue1h[dataLabels[j]]=0.0;
        }
        /*let cee5m = events.slice(idx5m, nextAggregateIdx+1).map(x=>{return x.toJSON();}).reduce((pv,te)=>{
          for(let j = 2; j < dataLabels.length;j++) {    
            pv[dataLabels[j]]+=Math.pow(10,te.data[dataLabels[j]]/10.0); // add all un-log-ed values
          }
          return pv;
        },initialValue5m);
        let cee1h = events.slice(idx1h, nextAggregateIdx+1).map(x=>{return x.toJSON();}).reduce((pv,te)=>{
          for(let j = 2; j < dataLabels.length;j++) {    
            pv[dataLabels[j]]+=Math.pow(10,te.data[dataLabels[j]]/10.0); // add all un-log-ed values
          }
          return pv;
        },initialValue1h);
        */
        //console.log("cee5m["+nextAggregateIdx+"]=" + JSON.stringify(cee5m));
        let stop = false;
        for(let j = 2; j < dataLabels.length;j++) {
          let lbl = dataLabels[j];
          newData.data[lbl] = parseFloat(newData.data[lbl]);
          //console.log("ee5m[lbl] = " + ee5m[lbl]);
          ee5m[lbl] += newData.data.ee[lbl];
          //if(lbl == "LeqA")console.log("added ee[LeqA]=" + newData.data.ee[lbl] + " to ee5m, now " + ee5m[lbl]);
          ee1h[lbl] += newData.data.ee[lbl];
          
          //newData.data[lbl+"_5m"] = 10*Math.log10(ee5m[lbl]/(length5msecs)); 
          //if(lbl == "LeqA")console.log("10*Math.log10(ee5m[LeqA]/300)= 10*Math.log10(" + ee5m[lbl]+ "/300) = 10*" + Math.log10(ee5m[lbl]/300));
          //newData.data[lbl+"_1h"] = 10*Math.log10(ee1h[lbl]/(length1hsecs));
          
          newData.data[lbl+"_5m"] = 10*Math.log10(ee5m[lbl]/length5msecs);
          /*if(Math.abs(cee5m[lbl] - ee5m[lbl]) > 0.5) {
            console.log("idx  " + nextAggregateIdx + ": ee5m["+lbl+"] != cee5m["+lbl+"]: " + JSON.stringify(cee5m) + ", ee5m = " + JSON.stringify(ee5m));
            clearInterval(this.interval);
            stop = true;
            break;
          }*/
          newData.data[lbl+"_1h"] = 10*Math.log10(ee1h[lbl]/length1hsecs);
          /*if(Math.abs(cee1h[lbl] - ee1h[lbl]) > 0.5) {
            console.log("idx  " + nextAggregateIdx + ": ee1h["+lbl+"] != cee1h["+lbl+"]: " + JSON.stringify(cee1h) + ", ee5m = " + JSON.stringify(ee1h));
            clearInterval(this.interval);
            stop = true;
            break;
          }*/
        }          
        //console.log("newData after adding window aggregate= ", newData);
        //console.log("aggregating "  + nextAggregateIdx + " 5m start = " + idx5m + ", size = " +(nextAggregateIdx-idx5m) + " bins, " + (ts-events[idx5m].timestamp()) + " ms, current ee total = " + ee5m["LeqA"] + ", ee in currentLine = " + newData.data.ee["LeqA"]);
        //console.log("aggregating "  + nextAggregateIdx + " 1h start = " + idx1h + ", size = " +(nextAggregateIdx-idx1h) + " bins, " + (ts-events[idx1h].timestamp()) + " ms, current ee total = " + ee1h["LeqA"] + ", ee in currentLine = " + newData.data.ee["LeqA"]);

        events[nextAggregateIdx] = new TimeEvent(newData.time, newData.data);
        //console.log("aggregated " + nextAggregateIdx + ": idx5m =" + idx5m + ", length = " +(events[nextAggregateIdx].timestamp()-events[idx5m].timestamp())/1000 +"s, idx1h = " + idx1h + ", length = " + (events[nextAggregateIdx].timestamp()-events[idx1h].timestamp())/1000);
        if(stop) break;
      }

      console.log("aggregation done, next idx = " + nextAggregateIdx);
      
      // now discard values out of data window
      try {
        while(events[0].timestamp() < newWindowStartTime.getTime()) {
          if(idx5m == 0) {
            console.log("skip discard pre window events because still in 5m window: " + new Date(events[0].timestamp()));
            break;
          }
          if(idx1h == 0) {
            console.log("skip discard pre window events because still in 1h window: " + new Date(events[0].timestamp()));
            break;
          }
          console.log("discard pre window event " + new Date(events[0].timestamp()) + " idx1h = " + idx1h);
          if(nextAggregateIdx == 0) {
            console.error("nextAggregateIdx < 0: " + nextAggregateIdx );
            return;
          }
          nextAggregateIdx--;
          idx5m--;
          idx1h--;
          events.shift();
        }
      }
      catch(e) {
        console.log("events[0] = " + JSON.stringify(events[0],null,2));
      }
      console.log("dropped before window values and adjusted indexes");
      this.setState((ps)=> {
        console.log("new data window range: " + newWindowStartTime + " - " + newWindowEndTime);
        
        ps.dataWindow.status = "loaded";
        ps.dataWindow.windowEndTime = newWindowEndTime;
        ps.dataWindow.windowStartTime = newWindowStartTime;
        ps.events = events;
        ps.dataWindow.idx5m = idx5m;
        ps.dataWindow.idx1h = idx1h;
        ps.dataWindow.nextAggregateIdx = nextAggregateIdx;
        /*console.log("new events:");
        for(let i = ps.events.length-10; i < ps.events.length; i++) {
          console.log(ps.events[i].toJSON());
        }
        */
        return ps;
      });
    }
    this.updating = false;
  }
  
  async componentDidMount() {
    this.updateWindowDimensions();
    
    window.addEventListener('resize', this.updateWindowDimensions);
    
    await this.connectToStorage();
    console.log("storage connected, now loading initial data");
    
    await this.initializeDataWindow();
    console.log("data winodw loaded. nmdId = " + this.state.nmdId + ". initializing NMS websocket keep-alive...");
    
    const increment = sec;
    this.interval = setInterval(async ()=>{
      if(this.nmdClient) { 
        if( (new Date().getTime() - this.lastPing.getTime()) > 3000) {
          console.log("" + new Date() + ": found stale server connection not pinged since " + this.lastPing + ", leaving, then resetting nmdClient and scheduling reconnect...");
          this.sendRemoteCommand({command:"leave",params:[false]});           
          this.nmdClient.close();
          this.nmdClient = null;
          if(this.state.nmdId) {
            console.log("setting timer for reconnect attempt...");
            setTimeout(this.joinNMS.bind(this, this.state.nmdId),1000);
          }
          return;
        }
        else {
          //console.log("" + new Date() + ": sending ping to server");
          this.sendRemoteCommand({command:"clientPing",params:[]});
        }
      }
      else {
        this.nmdClient = null;
        if(this.state.nmdId) {
          clearTimeout();
          console.log("no nmd client, setting time out to re connect to nmd " + this.state.nmdId ,true);
          // find out whether the game exists on server
          setTimeout(this.joinNMS.bind(this, this.state.nmdId),1000);
        }
      }
    },2000);
  

  /*
    this.interval = setInterval(async () => {
            if(this.state.storageConnectionStatus != "up") return;
            if(this.state.dataWindow.type != "rolling") {
              console.log("dataWindow type != rolling, skip update");
            }
            if(this.state.dataWindow.status != "loaded") {
              console.log("dataWindow status != loaded, skip update");
            }
            const t = new Date(this.state.time.getTime() + increment);
            console.log("Executing interval trigger at " + t);
            await this.getNewEvents();

            console.log("new events read, window now " + this.state.events.length + " bins, " + this.state.dataWindow.windowStartTime + " - " + this.state.dataWindow.windowEndTime);
            // Raw events
            const newEvents = this.state.events;
            let newMin = this.state.minValue;
            let newMax = this.state.maxValue;

            this.setState({ time: new Date(), minValue: newMin,maxValue: newMax });
        }, rate);
    */
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
    console.log("joinNMS called, retry = " + (this.state.retry+1));
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
    this.setState(ps=> {
      ps.retry = ps.retry+1;
      ps.nmdId = nmdId;
      ps.uiState.status = "auto";
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
            console.log("received new data from NMS: " + messageObj.params[0]);
            let events = [];
            if(this.state.dataWindow.status == "loaded") {
              this.addDataToEvents(messageObj.params[0], events);
              this.addEvents(events);
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
        let syncStart = new Date(this.state.events[this.state.events.length-1].timestamp()).toISOString().substring(0,19);
        console.log("sending sync command to NMS to start sending data for rolling window from " + syncStart);
        this.sendRemoteCommand({command:"sync",params:[syncStart]});
      }
      else {
        console.log("skip asking NMS to sync data since state is not loaded AND rolling");
      }
    }
  }  
}