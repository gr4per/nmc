import {TimeEvent} from "pondjs";

export default class NMDataWindow {  
  
  /**
   * length - window duration in seconds
   * type - rolling or static
   */
  constructor(length, type) {
    
    // this is the properties describing the window state. rendering relevant
    this.state = {
      type:type,
      length:length,
      maxY:100.0,
      minY:20.0,
      windowStartTime:new Date(new Date().getTime()-length*1000),
      windowEndTime:new Date(),
      status:"initializing"
    }
    
    // is is an actual array of TimeEvent objects holding the windows data
    this.events = [];
    
    // these are the floating energy aggregates across the supported floating windows
    this.ee5m = {};
    this.ee1h = {};
    this.idx5m = 0;
    this.idx1h = 0;

    this.nextAggregateIdx = 0;
   
  }

  /**
   * Takes data as string in NM csv file format
   * slot time, recv time, a , b, c, z, bands0..N
   * and applies them to a given TimeEvent array
   */
  addDataToEvents(data,events) {
    let lines = data.split("\r\n").filter((x)=>{return x.length > 0;});
    console.log("data has " + lines.length + " lines");
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

  
  /**
   * Takens an array of TimeEvents and appends them to this data window
   * It will perform aggregation for each added Event
   * and update the data window end time to point to newest event passed or NOW
   * and the window start time based on duration
   * Will also discard all previous events in the window that have moved before start time
   */
  addEvents(events) {
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
    let idx5m = this.state.idx5m;
    let idx1h = this.state.idx1h;
    let ee5m = this.state.ee5m;
    let ee1h = this.state.ee1h;
    
    if(events.length == 0) {
      console.log("zero new events, skipping aggregation");
    }
    else {
      // init window total energies
      if( Object.keys(this.state.ee5m).length == 0) {
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
      let nextAggregateIdx = this.state.nextAggregateIdx;
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
          events.shift(); // just iterate and then splice the array once instead each loop
        }
      }
      catch(e) {
        console.log("events[0] = " + JSON.stringify(events[0],null,2));
      }
      console.log("dropped before window values and adjusted indexes");
      console.log("new data window range: " + newWindowStartTime + " - " + newWindowEndTime);
      
      this.state.status = "loaded";
      this.state.windowEndTime = newWindowEndTime;
      this.state.windowStartTime = newWindowStartTime;
      this.events = events;
      this.state.idx5m = idx5m;
      this.state.idx1h = idx1h;
      this.state.nextAggregateIdx = nextAggregateIdx;
    }
    return this.state;
  }
}