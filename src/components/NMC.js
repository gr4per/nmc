import React, { Component} from "react";
import {BlobServiceClient, BlobCorsRule} from "@azure/storage-blob";
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
        visibleTS: ["LeqA","LeqA_5m", "LeqA_1h"],
        startTime: new Date(),
        time: new Date(),
        events: new Array(0),
        minValue:NaN,
        maxValue:NaN,
        storageConnectionStatus:"n/a",
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
      "LeqA":{
            normal: {
                stroke: "gold",
                fill:"none",
                strokeWidth:3,
                opacity: 0.7
            }
      },
      "LeqA_5m":{
            normal: {
                stroke: "gold",
                fill:"none",
                strokeDasharray:"10,10",
                strokeWidth:3,
                opacity: 0.7
            }
      },
      "LeqA_1h":{
            normal: {
                stroke: "gold",
                fill:"none",
                strokeDasharray:"20,10",
                strokeWidth:3,
                opacity: 0.7
            }
      },
      "Leq40Hz":{
            normal: {
                stroke: "orangered",
                fill:"none",
                strokeWidth:3,
                opacity: 0.7
            }
      },
      "Leq50Hz":{
            normal: {
                stroke: "forestgreen",
                fill:"none",
                strokeWidth:3,
                opacity: 0.7
            }
      },
      "Leq63Hz":{
            normal: {
                stroke: "darkorchid",
                fill:"none",
                strokeWidth:3,
                opacity: 0.7
            }
      },
      "Leq80Hz":{
            normal: {
                stroke: "white",
                fill:"none",
                strokeWidth:3,
                opacity: 0.7
            }
      }
    };
    

    if(this.state.storageConnectionStatus == "n/a" || this.state.storageConnectionStatus == "error") {
      return <StorageConnectionModal message={this.state.storageConnectionMessage} status={this.state.storageConnectionStatus} onSubmit={this.connectToStorage.bind(this)}/>
    }
    
    
    const eventSeries = [];
    let evArr = this.state.events;
    /*if(evArr)console.log("render: constructing time series based on array: " + JSON.stringify(evArr.map(x=>{try {
      return new Date(x.timestamp()).toISOString();
    }
    catch(e){console.error("cannot convert to isostrimg: " + JSON.stringify(x)); return x;}}),null,2));
    */
    eventSeries[0] = new TimeSeries({ name: "raw", events: evArr });
    const timeRange = new TimeRange(this.state.dataWindow.windowStartTime, this.state.dataWindow.windowEndTime);
    
    /* the problem here is that this just cuts the series into 5m adjacent windows, not usable for providing a floating window aggregation
    eventSeries[1] = eventSeries[0].fixedWindowRollup({
        windowSize: "5m",
        aggregation: {LeqA_5m: {LeqA: avg()}},
        toTimeEvents:true
    });    */ 

    // Charts (after a certain amount of time, just show hourly rollup)
    const charts = (
        <Charts>
        {eventSeries.map((es,idx)=><LineChart style={lineStyle} columns={this.state.visibleTS} axis="y" series={eventSeries[idx]} interpolation="curveLinear"/>)}
        </Charts>
    );

    const dateStyle = {
        fontSize: 12,
        color: "#AAA",
        borderWidth: 1,
        borderColor: "#F4F4F4"
    };

    const ymin = this.state.minValue;
    const ymax = this.state.maxValue;
    //console.log("ymin = " + ymin + ", ymax = " + ymax)
    let event = eventSeries[0]?eventSeries[0].atLast():null;
    let temps = 0;
    for(let i = 0; i < eventSeries.length;i++) {
      if(eventSeries[i].atLast())temps++;
    }
    const currentTemp = event?event.toJSON().data.value:NaN;
    const chartHeight = Math.max(150,this.state.height-120);    
    return (
            <div>
                <div className="row">
                    <div className="col-md-8">
                        <span style={dateStyle}>{latestTime}</span>
                    </div>
                    <div className="col-md-8">
                        <div style={{"display":"flex","width":"100%","fontSize":"32pt","color":"white"}}>{eventSeries.map((e,idx)=><div style={{width:""+(100/temps)+"%"}}>{
                          eventSeries[idx].atLast()?
                          <span>T{idx} {eventSeries[idx].atLast().toJSON().data.value} °C</span>:
                          <div/>
                        }
                          </div>)}</div>
                    </div>
                </div>
                <hr />
                <div className="row">
                    <div className="col-md-12">
                        <Resizable>
                            <ChartContainer timeRange={timeRange}>
                                <ChartRow height={chartHeight}>
                                    <YAxis
                                        id="y"
                                        label="Leq"
                                        min={isNaN(this.state.minValue)?0:this.state.minValue}
                                        max={isNaN(this.state.maxValue)?100:this.state.maxValue}
                                        width="70"
                                        type="linear"
                                        format=".2f"
                                        showGrid="true"
                                    />
                                    {charts}
                                </ChartRow>
                            </ChartContainer>
                        </Resizable>
                    </div>
                </div>
            </div>
        );
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
    let blobServiceClient = null;
    try {
      console.log("opening connection to storage...");
      let url = newConnStr.substring(0,newConnStr.indexOf("?"));
      let token = newConnStr.substring(newConnStr.indexOf("?")+1,newConnStr.length);
      //blobServiceClient = new BlobServiceClient(url,token);
      blobServiceClient = new BlobServiceClient(newConnStr);
      
      let containerClient = await blobServiceClient.getContainerClient("nmpi-test");
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
        if(e.statusCode == "409") {
          console.log("blob modified while being read");
          this.upadting = false;
          return;
        }
        console.log("download failed: " + JSON.stringify(e));
        break;
      }
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
      console.log("after applying " + currentFileName + " data, eventBuffer with new events now " + events.length + " entries long");
      // set to next full hour
      console.log("currentStartTime = " + currentStartTime + ", forwarding to next full hour");
      currentStartTime = new Date(Math.floor(currentStartTime.getTime()/3600/1000)*3600*1000+3600*1000);
      console.log("currentStartTime now " + currentStartTime);
    }
    let newestEventTime = new Date(events[events.length-1].timestamp());
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
      let dropEnergies = true;
      if( Object.keys(this.state.dataWindow.ee5m).length == 0) {
        dropEnergies = false; // on the first pass no energies in window yet
        console.log("initializing 5m and 1h window total energies to 0.0 for all values");
        for(let i = 2; i < dataLabels.length;i++) {
          ee1h[dataLabels[i]] = ee5m[dataLabels[i]] = 0.0;
        }
      }

      events = this.state.events.concat(events);
      
      // iterate the new events and aggregate each
      let nextAggregateIdx = this.state.dataWindow.nextAggregateIdx;
      console.log("data aggregation starting at index " + (nextAggregateIdx) + " out of total " + events.length + " events");
      for(; nextAggregateIdx < events.length; nextAggregateIdx++) {
        //if(nextAggregateIdx == 10) return;
        let ts = events[nextAggregateIdx].timestamp();
        

        // slide the 5m window forward until and substract energies from now out of window events
        while(ts - events[idx5m].timestamp() > length5msecs*1000) {
          if(dropEnergies) {
            console.log("dropping " + idx5m + " (" + new Date(events[idx5m].timestamp()) + " from 5m window...");
            let data = events[idx5m].toJSON();
            for(let j = 2; j < dataLabels.length;j++) {
              let lbl = dataLabels[j];
              try {
                ee5m[lbl] -= data.data.ee[lbl];
              }
              catch(e) {
                console.log("lbl = " + lbl + ", data = " + JSON.stringify(data) + ", ee5m = " + JSON.stringify(ee5m,null,2));
                throw e;
              }
            }       
          }
          idx5m++;            
        }
        // slide the 1h window forward until and substract energies from now out of window events
        console.log("" + nextAggregateIdx + ": going to push idx1h  forward from " + idx1h + ", event.length = " + events.length);
        while(ts - events[idx1h].timestamp() > length1hsecs*1000) {
          if(dropEnergies) {
            console.log("dropping " + idx1h + " (" + new Date(events[idx1h].timestamp()) + " from 1h window...");
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
        let cee5m = events.slice(idx5m, nextAggregateIdx).map(x=>{return x.toJSON();}).reduce((pv,te)=>{
          for(let j = 2; j < dataLabels.length;j++) {    
            pv[dataLabels[j]]+=Math.pow(10,te.data[dataLabels[j]]/10.0); // add all un-log-ed values
          }
          return pv;
        },initialValue5m);
        let cee1h = events.slice(idx1h, nextAggregateIdx).map(x=>{return x.toJSON();}).reduce((pv,te)=>{
          for(let j = 2; j < dataLabels.length;j++) {    
            pv[dataLabels[j]]+=Math.pow(10,te.data[dataLabels[j]]/10.0); // add all un-log-ed values
          }
          return pv;
        },initialValue1h);
        //console.log("cee5m["+nextAggregateIdx+"]=" + JSON.stringify(cee5m));
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
          
          /*newData[lbl+"_5m"] = 10*Math.log10(events.slice(idx5m, nextAggregateIdx).map(x=>{return x.toJSON();}).reduce((pv,te)=>{
            return pv+Math.pow(10,te.data[lbl]/10.0); // add all un-log-ed values
          },0.0)/length5msecs)
          newData[lbl+"_1h"] = 10*Math.log10(events.slice(idx1h, nextAggregateIdx).map(x=>{return x.toJSON();}).reduce((pv,te)=>{
            return pv+Math.pow(10,te.data[lbl]/10.0); // add all un-log-ed values
          },0.0)/length1hsecs)
          */
          newData.data[lbl+"_5m"] = 10*Math.log10(cee5m[lbl]/length5msecs);
          newData.data[lbl+"_1h"] = 10*Math.log10(cee1h[lbl]/length1hsecs);
        }          
        //console.log("newData after adding window aggregate= ", newData);
        //console.log("aggregating "  + nextAggregateIdx + " 5m start = " + idx5m + ", size = " +(nextAggregateIdx-idx5m) + " bins, " + (ts-events[idx5m].timestamp()) + " ms, current ee total = " + ee5m["LeqA"] + ", ee in currentLine = " + newData.data.ee["LeqA"]);
        //console.log("aggregating "  + nextAggregateIdx + " 1h start = " + idx1h + ", size = " +(nextAggregateIdx-idx1h) + " bins, " + (ts-events[idx1h].timestamp()) + " ms, current ee total = " + ee1h["LeqA"] + ", ee in currentLine = " + newData.data.ee["LeqA"]);

        events[nextAggregateIdx] = new TimeEvent(newData.time, newData.data);
        console.log("aggregated " + nextAggregateIdx + ": idx5m =" + idx5m + ", length = " +(events[nextAggregateIdx].timestamp()-events[idx5m].timestamp())/1000 +"s, idx1h = " + idx1h + ", length = " + (events[nextAggregateIdx].timestamp()-events[idx1h].timestamp())/1000);
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
        ps.dataWindow.lastFileRead = currentFileName;
        ps.dataWindow.lastBytesRead = (currentFileName==cfn?bytesRead:0)+data.length;
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
    console.log("data winodw loaded.");
    
    const increment = sec;
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

            //while(events.length >= newEvents.length) {
            //  newEvents.push(new Ring(3600*3));
            //}
            /*
            for(let i = 0 ; i < events.length; i++) {
              //console.log("pushing event to series " + i);
              //newEvents[i].push(events[i]);
              //newMin = isNaN(newMin)?events[i].toJSON().data.value:Math.min(events[i].toJSON().data.value, newMin);
              //newMax = isNaN(newMax)?events[i].toJSON().data.value:Math.max(events[i].toJSON().data.value, newMax);
              if(i == 0) {
                // Let our aggregators process the event
                //console.log("newEvents[i]: " + JSON.stringify(newEvents[i]));
                let window5s = [];
                let windowStart = new Date(new Date().getTime()-5500);
                let bevts = newEvents[i].toArray();
                //console.log("bevts: " + JSON.stringify(bevts));
                let beptr = bevts.length-1;
                let e = null;
                while(bevts.length > 0 && beptr > -1 && (e = bevts[beptr--]).toJSON().time > windowStart) {
                  window5s.push(e);
                  //console.log("e: " + JSON.stringify(e));
                }
                //console.log("beptr = " + beptr);
                if(beptr >= 0 && bevts.length > 0) {
                  console.log("discarding events before " + bevts[beptr].toJSON().time);
                }
                //console.log("window: " + JSON.stringify(window5s));
                let avg = 0;
                let count = window5s.length;
                //console.log("count: " + count);
                let avgTime = -1;
                if(window5s.length >0) {
                  avgTime = window5s[0].toJSON().time;
                }
                //console.log("avgTime = " + avgTime);
                for(let e of window5s) {
                  avg += Number(e.toJSON().data.value);
                  //newEvents[i].push(e);
                }
                if(count >0) {
                  avg /= count;
                  //console.log("avg: " + avg);
                  avg *= 100;
                  avg = Math.trunc(avg)/100.0;
                  let navg = new TimeEvent(avgTime, avg);
                  //console.log("navg: " + JSON.stringify(navg.toJSON()));
                  this.state.ntcAggregate.push(navg);
                }
              }
            }
            */
            this.setState({ time: new Date(), minValue: newMin,maxValue: newMax });

        }, rate);
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
}