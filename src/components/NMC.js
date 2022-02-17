import React, { Component} from "react";

import Ring from "ringjs";
let debug = true;
let rcl = console.log;
console.log = function() {
  if(debug) rcl.apply(null,arguments);
}
import {
    TimeSeries,
    TimeRange,
    TimeEvent
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

// based on https://software.es.net/react-timeseries-charts/#/example/realtime

export default class NMC extends React.Component {  

  state = {
        startTime: new Date(),
        time: new Date(),
        events: [new Ring(3600*3)],
        ntcAggregate: new Ring(3600*3),
        minValue:NaN,
        maxValue:NaN
  };

  getNewEvents = async () => {
    return new Promise( (resolve,reject) => {
      var request = new XMLHttpRequest();

      // Open a new connection, using the GET request on the URL endpoint
      request.open('GET', 'http://192.168.188.42/api', true)

      request.onload = function () {
        var data = JSON.parse(this.response)

        /* example json
        {
          secure_counter: 8279,
          symbol: "°C",
          temperatures: ["18.38","23.76"]
          unit: "Celsius"
        }*/
        if (request.status >= 200 && request.status < 400) {
            console.log("API response temps: " + data.temperatures);
            let t = new Date();
            let events = [];
            for(let i = 0; i < data.temperatures.length;i++) {
              events[i] = new TimeEvent(t, data.temperatures[i]);
            }
            resolve(events);
          
        } else {
          console.log('error')
          reject("API call failed with code " + request.status);
        }
        
      }

      // Send request
      request.send()
    });
  };

  constructor(props) {
    super(props);
    this.version = "1.1.4";
    this.updateWindowDimensions = this.updateWindowDimensions.bind(this);
  }    
  
  render() {  
    const latestTime = `${this.state.time}`;

    const lineStyle = [
      {
        value: {
            normal: {
                stroke: "gold",
                fill:"none",
                strokeWidth:3,
                opacity: 0.7
            }
        }
      },
      {
        value: {
            normal: {
                stroke: "orangered",
                fill:"none",
                strokeWidth:3,
                opacity: 0.7
            }
        }
      },
      {
        value: {
            normal: {
                stroke: "forestgreen",
                fill:"none",
                strokeWidth:3,
                opacity: 0.7
            }
        }
      },
      {
        value: {
            normal: {
                stroke: "darkorchid",
                fill:"none",
                strokeWidth:3,
                opacity: 0.7
            }
        }
      },
      {
        value: {
            normal: {
                stroke: "white",
                fill:"none",
                strokeWidth:3,
                opacity: 0.7
            }
        }
      }
      ];
    

    const eventSeries = [];
    for(let i = 0; i < this.state.events.length; i++) {
      if(!this.state.events[i])continue;
      eventSeries[i] = new TimeSeries({
        name: "raw",
        events: this.state.events[i].toArray()
      });
    }
    if(this.state.events[0]) {
      //console.log("ntcAggregate: " + JSON.stringify(this.state.ntcAggregate.toArray()));
      eventSeries[0] = new TimeSeries({
        name: "5s aggregate",
        events: this.state.ntcAggregate.toArray()
      });
    }
    

    // Timerange for the chart axis
    const initialBeginTime = this.state.startTime;
    const timeWindow = 3 * hours;

    let beginTime;
    const endTime = new Date(this.state.time.getTime() + sec);
    if (endTime.getTime() - timeWindow < initialBeginTime.getTime()) {
        beginTime = initialBeginTime;
    } else {
        beginTime = new Date(endTime.getTime() - timeWindow);
    }
    const timeRange = new TimeRange(beginTime, endTime);

    // Charts (after a certain amount of time, just show hourly rollup)
    const charts = (
        <Charts>
        {eventSeries.map((es,idx)=><LineChart axis="y" series={eventSeries[idx]} style={lineStyle[idx]} interpolation="curveLinear"/>)}
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
                          <span>T{idx} {eventSeries[idx].atLast().toJSON().data.value} °C<nbsp/><nbsp/></span>:
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
                                        label="Temperature °C"
                                        min={isNaN(this.state.minValue)?0:this.state.minValue}
                                        max={isNaN(this.state.maxValue)?0:this.state.maxValue}
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
  
  
  
  async componentDidMount() {
    this.updateWindowDimensions();
    
    window.addEventListener('resize', this.updateWindowDimensions);
    const increment = sec;
        this.interval = setInterval(async () => {
            const t = new Date(this.state.time.getTime() + increment);
            console.log("Executing interval trigger at " + t);
            const events = await this.getNewEvents();

            // Raw events
            const newEvents = this.state.events;
            let newMin = this.state.minValue;
            let newMax = this.state.maxValue;

            while(events.length >= newEvents.length) {
              newEvents.push(new Ring(3600*3));
            }
            for(let i = 0 ; i < events.length; i++) {
              //console.log("pushing event to series " + i);
              newEvents[i].push(events[i]);
              newMin = isNaN(newMin)?events[i].toJSON().data.value:Math.min(events[i].toJSON().data.value, newMin);
              newMax = isNaN(newMax)?events[i].toJSON().data.value:Math.max(events[i].toJSON().data.value, newMax);
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
            this.setState({ time: new Date(), events: newEvents, minValue: newMin,maxValue: newMax });
            

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