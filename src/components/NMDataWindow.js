import {TimeEvent} from "pondjs";

// 40 bands: 4 full spectrum (A, B, C, Z) and 36 1/3 octave
const bands = ["LeqA","LeqB","LeqC","LeqZ","Leq6.3Hz","Leq8Hz","Leq10Hz","Leq12.5Hz","Leq16Hz","Leq20Hz","Leq25Hz","Leq31.5Hz","Leq40Hz","Leq50Hz","Leq63Hz","Leq80Hz","Leq100Hz","Leq125Hz","Leq160Hz","Leq200Hz","Leq250Hz","Leq315Hz","Leq400Hz","Leq500Hz","Leq630Hz","Leq800Hz","Leq1kHz","Leq1.25kHz","Leq1.6kHz","Leq2kHz","Leq2.5kHz","Leq3.15kHz","Leq4kHz","Leq5kHz","Leq6.3kHz","Leq8kHz","Leq10kHz","Leq12.5kHz","Leq16kHz","Leq20kHz"];
const dataLabels = ["Time","RcvTime"].concat(bands);
const length5msecs = 300;
const length1hsecs = 3600;

export default class NMDataWindow {  
  
  /**
   * length - window duration in seconds
   * startTime - if null, means window is rolling ending now
   * thresholds - map of bandname to float dB value, e.g. {"A":90.0}
   * visibleBands - bands to take into account in aggregation etc.
   */
  constructor(startTime, length, thresholds, visibleBands) {
    
    // this is the properties describing the window state. rendering relevant
    this.state = {
      type:startTime==null?"rolling":"fix",
      length:length,
      max:{},
      min:{},
      visibleBands:visibleBands,
      windowStartTime:startTime!=null?startTime:new Date(new Date().getTime()-length*1000),
      windowEndTime:startTime!=null?new Date(startTime.getTime()+length*1000):new Date(),
      status:"initializing"
    }
    
    // is is an actual array of TimeEvent objects holding the windows data
    this.events = [];
    this.thresholds = thresholds;
    
    // these are the floating energy aggregates across the supported floating windows
    this.ee5m = {};
    this.ee1h = {};
    this.idx5m = 0;
    this.idx1h = 0;
    this.min = {}; // map band to min value in current window
    this.max = {}; // map band to min value in current window
    this.nextAggregateIdx = 0;
    this.thresholdEvents = {}; // map band to array of Event objects {startTime, endTime, totalEnergy, Leq, color}
   
  }

  /**
   * Takes data as string in NM csv file format
   * slot time, recv time, a , b, c, z, bands0..N
   * and applies them to a given TimeEvent array
   */
  addDataToEvents(data,events) {
    let lines = data.split("\r\n").filter((x)=>{return x.length > 0;});
    console.log("data has " + lines.length + " lines.");
    if(lines.length>0 && lines[0][0] == "I") { lines.shift(); } // drop header line
    if(lines.length == 0) return;
    console.log("first: " + lines[0].substring(0,19) + ", last: " + lines[lines.length-1].substring(0,19));
    for(let l of lines) {
      let timeStr = l.substring(0,l.indexOf("\t"));
      //console.log("line timeStr='" + timeStr + "'");
      let lineTime = new Date(timeStr+".000Z");
      //console.log("line time " + lineTime);
      if(this.state.type != "rolling" && lineTime.getTime() > this.state.windowEndTime.getTime())break;
      if(lineTime.getTime() >= this.state.windowStartTime.getTime()) {
        //console.log("adding line to data");
        this.applyDataLineToWindow(events, lineTime,l); // converts l, lineTime to TimeEvent including energy eqivalents
                                                        // and adds to events
      }
    }
  }
  
  /**
   * applies a single csv line to an array of TimeEvents
   */
  applyDataLineToWindow(eventBuffer, t, line) {
    let l = line.split("\t");
    let dataMap = {ee:{}}
    for(let i = 2;i < dataLabels.length;i++) {
      let label = dataLabels[i];
      dataMap[label] = l[i];
      dataMap[label+"_a5m"] = l[i+bands.length];
      dataMap[label+"_a1h"] = l[i+bands.length*2];
      dataMap[label+"_attn"] = l[i+bands.length*3];
      dataMap.ee[label] = Math.pow(10,parseFloat(l[i])/10.0);
    }
    //{"LeqA":l[2],"LeqB":l[3],"LeqC":l[4],"LeqZ":l[5],"Leq6.3Hz":l[6],"Leq8Hz":l[7],"Leq10Hz":l[8],"Leq12.5Hz":l[9],"Leq16Hz":l[10],"Leq20Hz":l[11],"Leq25Hz":l[12],"Leq31.5Hz":l[13],"Leq40Hz":l[14],"Leq50Hz":l[15],"Leq63Hz":l[16],"Leq80Hz":l[17],"Leq100Hz":l[18],"Leq125Hz":l[19],"Leq160Hz":l[20],"Leq200Hz":l[21],"Leq250Hz":l[22],"Leq315Hz":l[23],"Leq400Hz":l[24],"Leq500Hz":l[25],"Leq630Hz":l[26],"Leq800Hz":l[27],"Leq1kHz":l[28],"Leq1.25kHz":l[29],"Leq1.6kHz":l[30],"Leq2kHz":l[31],"Leq2.5kHz":l[32],"Leq3.15kHz":l[33],"Leq4kHz":l[34],"Leq5kHz":l[35],"Leq6.3kHz":l[36],"Leq8kHz":l[37],"Leq10kHz":l[38],"Leq12.5kHz":l[39],"Leq16kHz":l[40],"Leq20kHz":l[41]};
    if(eventBuffer.length > 0) {
      let top = eventBuffer[eventBuffer.length-1];
      if(t.getTime() <= top.timestamp()) {
        console.error("pushing line violates ordering contract, previous line time " + new Date(top.timestamp()) + ", new line " + l);
      }
    }
    eventBuffer.push(new TimeEvent(t, dataMap));
  }

  
  /**
   * Implements the traffic light color coding for timerange events
   * green is default
   * yellow if 5m over the 1h band limit
   * orange if 5m 3dB over 1h band limit
   * red if 5m 3dB over 1h band limit AND 1h value less than 3dB below 1h limit
   * black if 1h over 1h limit
   */
  getColor(band, data) {
    let lbl = "Leq" + band;
    if(data[lbl+"_1h"]>this.thresholds[band]){
      return "black";
    }
    if(data[lbl+"_5m"]>this.thresholds[band]+3.0){
      if(data[lbl+"_1h"]+3.0>this.thresholds[band]) {
        return "red";
      }
      return "orange";
    }
    if(data[lbl+"_5m"]>this.thresholds[band]){
      return "yellow";
    }
    return "green";
  }
  
  /**
   * Takens an array of TimeEvents and appends them to this data window
   * It will perform aggregation for each added Event
   * and update the data window end time to point to newest event passed or NOW
   * and the window start time based on duration
   * Will also discard all previous events in the window that have moved before start time
   * 
   * returns updated windowState or null if nothing was changed
   */
  addEvents(events) {
    if(!events || events.length <1) {
      console.log("skipping addEvents because no events passed.");
      return null;
    }
    if(this.state.type != "rolling" && events[0].timestamp().getTime() > this.state.windowEndTime.getTime()) {
      console.log("skipping add events as oldest event incoming is newer than window end of fix window.");
      return null;
    }
    let newestEventTime = new Date();
    if(events.length>0)newestEventTime = new Date(events[events.length-1].timestamp());
    console.log("update reached windowEnd, lastRecord time = " + newestEventTime + ", now aggregating new data");
    let newWindowEndTime = new Date(Math.floor(newestEventTime.getTime()/1000)*1000+1000);
    if(this.state.type == "rolling" && newWindowEndTime.getTime()+1000 < new Date().getTime()) {
      console.log("newest event in rolling window is stale " + newWindowEndTime + ", current client time = " + new Date());
      newWindowEndTime = new Date();
    }
    let newWindowStartTime = new Date(newWindowEndTime.getTime()-this.state.length*1000);
    
    // now aggregate the data
    let idx5m = this.idx5m;
    let idx1h = this.idx1h;
    let ee5m = this.ee5m;
    let ee1h = this.ee1h;
    
    if(events.length == 0) {
      console.log("zero new events, skipping aggregation");
    }
    else {
      // init window total energies and min/max values
      if( Object.keys(this.ee5m).length == 0) {
        console.log("initializing 5m and 1h window total energies to 0.0 for all values");
        for(let dl of this.state.visibleBands) {
          ee1h[dl] = ee5m[dl] = 0.0;
          for(let e of ["", "_5m", "_1h"]) {
            let dll = dl+e;
            this.min[dll] = 0.0;
            this.max[dll] = 100.0;
            //this.minLists[dataLabels[i]] = new Array();
            //this.maxLists[dataLabels[i]] = new Array();
          }
          this.thresholdEvents[dl] = new Array();
        }
      }

      events = this.events.concat(events);
      let prevTs = null;
      for(let i = 0;i < events.length; i++) {
        if(prevTs && events[i].timestamp() <= prevTs) {
          console.log("events: " + JSON.strinigfy(events));
          throw new Error("non chronological: i = " + i + ", prevTs = " +new Date(prevTs) + ", current = " + new Date(events[i].timestamp()));
        }
        prevTs = events[i].timestamp();
      }

      
      // iterate the new events and aggregate each
      let nextAggregateIdx = this.nextAggregateIdx;
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
        
        let stop = false;
        for(let lbl of this.state.visibleBands) {
          newData.data[lbl] = parseFloat(newData.data[lbl]);
          
          // add next row energies to aggregate energy
          ee5m[lbl] += newData.data.ee[lbl];
          ee1h[lbl] += newData.data.ee[lbl];
          
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
          
          // map band to array of Event objects {startTime, endTime, totalEnergy, leq, color}
          let band = lbl.substring(3,lbl.length); // strip the Leq prefix
          if(this.thresholds[band]) {
            let tevts = this.thresholdEvents[lbl];
            if(tevts.length == 0 || this.getColor(band, newData.data) != tevts[tevts.length-1].color) {
              tevts.push({startTime:new Date(ts.getTime()-1000),endTime:ts,totalEnergy:newData.data[lbl], leq:10*Math.log10(newData.data[lbl]), color:this.getColor(band, newData.data)});
            }
            else {
              let currentEvent = tevts[tevts.length-1];
              // add to event
              currentEvent.endTime =ts;
              currentEvent.totalEnergy+=newData.data[lbl];
              currentEvent.leq = 10*Math.log10(currentEvent.totalEnergy);
            }
          }
        }

        events[nextAggregateIdx] = new TimeEvent(newData.time, newData.data);
        //console.log("aggregated " + nextAggregateIdx + ": idx5m =" + idx5m + ", length = " +(events[nextAggregateIdx].timestamp()-events[idx5m].timestamp())/1000 +"s, idx1h = " + idx1h + ", length = " + (events[nextAggregateIdx].timestamp()-events[idx1h].timestamp())/1000);
        
        if(stop) break;
      }

      console.log("aggregation done, next idx = " + nextAggregateIdx);
      
      // now discard values out of data window
      let i = 0;
      try {
        for(i= 0; i < events.length; i++) {
          if(events[i].timestamp() < newWindowStartTime.getTime()) {
            if(idx5m == i) {
              console.log("skip discard pre window events because still in 5m window: " + new Date(events[i].timestamp()));
              break;
            }
            if(idx1h == i) {
              console.log("skip discard pre window events because still in 1h window: " + new Date(events[i].timestamp()));
              break;
            }
          }
          else {
            break; // events[i] liegt nicht vor dem fenster, darf also nicht gedroppt werden
          }
        }
        
        let eventsToDiscard = i-1;
        if(eventsToDiscard < 0) eventsToDiscard = 0;
        console.log("discard " + (i-1) + " pre window events up to (excluding)" + new Date(events[i].timestamp()) + " idx1h = " + idx1h);
        
        nextAggregateIdx-=eventsToDiscard;
        idx5m-=eventsToDiscard;
        idx1h-=eventsToDiscard;
        events.splice(0,eventsToDiscard); 
      }
      catch(e) {
        console.log("error discarding window values. events[0] = " + JSON.stringify(events[0],null,2) + ", e: ", e);
      }
      console.log("dropped before window values and adjusted indexes. new data window range: " + newWindowStartTime + " - " + newWindowEndTime);
      for(let lbl of Object.keys(this.thresholds).map(e=>{return "Leq"+e;})) {
        let match = this.state.visibleBands.find(p=>{return p === lbl;});
        if(!match) {
          console.log("skipping band " + lbl + " because not in visibleBands: " + JSON.stringify(this.state.visibleBands) );
          continue;
        }
        let k = 0;
        for(k = 0; i < this.thresholdEvents[lbl].length && this.thresholdEvents[lbl][k].endTime.getTime() <= this.state.windowStartTime ;k++) {
          ;
        }
        // now we can drop events with index < i
        if(k >0) {
          console.log("dropping thresholdEvents[" + lbl + "] up to index " + k + " out of " + this.thresholdEvents[lbl].length);
          this.thresholdEvents[lbl] = this.thresholdEvents[lbl].slice(k, this.thresholdEvents[lbl].length);
        }
      }
      
      // add next row values to sorted min/max list, we need min/max only for selected bands
      let pt = new Date();
      let min = {};
      let max = {};
      for(let i = 0; i < events.length; i++) {
        let d = events[i].toJSON().data;
        for(let dl of this.state.visibleBands) {
          for(let e of ["", "_5m", "_1h"]) {
            let dll = dl+e;
            if(isNaN(d[dll])) {
              console.error("field " + dl + " in row " + i + " is NaN: " + d[dll]);
            }            
            if( (!min[dll] && min[dll] != 0.0) || d[dll] < min[dll]){
              min[dll] = d[dll];
            }
            if( (!max[dll] && max[dll] != 0.0) || d[dll] > max[dll]){
              max[dll] = d[dll];
            }
          }
        }
      }
      let pte = new Date();
      console.log("min/max projection took " + (pte.getTime()-pt.getTime()) +  " ms on " + events.length + " rows");
      //console.log("min: " + JSON.stringify(min,null,2));
      //console.log("max: " + JSON.stringify(max,null,2));
      this.state.min = min;
      this.state.max = max;

      this.state.status = "loaded";
      this.state.windowEndTime = newWindowEndTime;
      this.state.windowStartTime = newWindowStartTime;
      this.events = events;
      this.idx5m = idx5m;
      this.idx1h = idx1h;
      this.nextAggregateIdx = nextAggregateIdx;
    }
    return this.state;
  }
  
  /**
   * Returns a string in the format yyyy-MM-ddTHH:mm:ss indicating the UTC second of the newest 
   * data entry
   */
  getNewestDateStr() {
    return new Date(this.events[this.events.length-1].timestamp()).toISOString().substring(0,19);
  }
}