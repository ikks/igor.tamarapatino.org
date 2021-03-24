var meta_data = {
    column_names: {},
    column_divip: {},
    max_applied: {},
    population: [],
    dept_names: [],
    latest_vac: [],
    perc_accum: [],
    to_apply: [],
    applied_today: [],
    accumulated: [],
    goal: [],
    inmunized: [],
    assignations: [],
    layers: {},
}

var map_views = {
    'Colombia': [[5.3, -73], 5],
    'Buenaventura': [[3.8899335, -77.0786047], 10],
    'Cartagena': [[10.3554, -75.56], 10],
    'Barranquilla': [[10.9799669, -74.8013085], 10],
    'Santa Marta': [[11.2422289, -74.2055606], 10],
};

var day_chart;
var cum_chart;
var compare_chart;
var assign_chart;
var array = [];
var array_2 = [];
var map;
var geojson;
var info;
var target_to_clean;
var text_dialog = "";
var colombia = 0;
var bought_vaccines = 61500000;

var GRADIENT_COLORS = ["#fb735f", "#ff8d5a", "#ffa65b", "#fcbf62", "#f7d771", "#e9dc6f", "#c9e473", "#acd75f", "#8dca4c", "#6bbd3b", "#42b02b"];

const NAME_ROW = 0;
const DP_ROW = 2;
const POP_ROW = 3;
const INI_VALUES = 10;
const OPERATION = 2;

const sheet_orig = 'Originales!A1:AQ1200';
const sheet_summ = 'Resumen!A1:AQ1200';
const sheet_plan = 'Plan!A1:AQ200';
const sheet_assi = 'Resoluciones!A1:F200';
const ID_ORIG = 0;
const ID_SUMM = 1;
const ID_PLAN = 2;
const ID_ASSI = 3;

const PERC_APPLIED = "Eficiencia";
const ACCUMULATED = "Acumuladas";
const APPLIED_TODAY = "Aplicadas";
const TO_APPLY = "Remanente";
const INMUNIZED = "2";
const ERROR_COLOR = '#cc00ff';

// Client ID and API key from the Developer Console
const CLIENT_ID = '75762908234-5om827gajcr4p5lplfhu3guhs732ob6u';
const API_KEY = 'AIzaSyDKDzmSgUMCrs7Jh5dc3ud2ZHx4nhazY_U';
// Array of API discovery doc URLs for APIs used by the quickstart
const DISCOVERY_DOCS = ["https://sheets.googleapis.com/$discovery/rest?version=v4"];
// Authorization scopes required by the API; multiple scopes can be
// included, separated by spaces.
const SCOPES = "https://www.googleapis.com/auth/spreadsheets.readonly";

/**
 *  On load, called to load the auth2 library and API client library.
 */
function handleClientLoad() {
    gapi.load('client:auth2', initClient);
}

/**
 *  Initializes the API client library and sets up sign-in state
 *  listeners.
 */
function initClient() {
    gapi.client.init({
        apiKey: API_KEY,
        clientId: CLIENT_ID,
        discoveryDocs: DISCOVERY_DOCS,
        scope: SCOPES
    }).then(function () {
        loadsheet()
    }, function(error) {
        appendPre(JSON.stringify(error, null, 2));
    });
}

/**
 * Append a pre element to the body containing the given message
 * as its text node. Used to display the results of the API call.
 *
 * @param {string} message Text to be placed in pre element.
 */
function appendPre(message) {
    var pre = document.getElementById('content');
    var textContent = document.createTextNode(message + '\n');
    pre.appendChild(textContent);
}

/**
 * Print the names and majors of students in a sample spreadsheet:
 * https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit
 */
function loadsheet() {
    var spreadsheetid = document.getElementById("loading").dataset.spreadsheetid;
    setup_map();
    gapi.client.sheets.spreadsheets.values.batchGet({
        spreadsheetId: spreadsheetid,
        ranges: [sheet_orig, sheet_summ, sheet_plan, sheet_assi],
    }).then(processSheetsData, function(response) {
        appendPre('Error: ' + response.result.error.message);
    });
}


function setup_map() {
    map = L.map('map').setView([5.3, -73], 5);
    L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw', {
        maxZoom: 10,
        minZoom: 5,
		attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, ' +
			'Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
		id: 'mapbox/light-v9',
		tileSize: 512,
		zoomOffset: -1
	}).addTo(map);


	// control that shows state info on hover
	info = L.control();

	info.onAdd = function (map) {
		this._div = L.DomUtil.create('div', 'info');
		this.update();
		return this._div;
	};

    var legend = L.control({position: 'bottomright'});

	legend.onAdd = function (map) {

		var div = L.DomUtil.create('div', 'info legend'),
			grades = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
			labels = [],
			from, to;

		for (var i = 0; i < grades.length - 1; i++) {
			from = grades[i];
			to = grades[i + 1];

			labels.push(
				'<i style="background:' + getColor(from) + '"></i> ' +
				from + (to ? '&ndash;' + to : ''));
		}

		div.innerHTML = labels.join('<br>');
		return div;
	};

	legend.addTo(map);

	info.update = function (props) {
        var idx;

        if (props) {
            idx = meta_data.column_divip[props.divipola][0];
		    this._div.innerHTML = '<h4>Vacunación por departamento</h4>' +  (props ?
			'<b>' + meta_data.dept_names[idx] + '</b><br />' + '<i class="colored-legend-covid" style="background:' + getColor(meta_data.perc_accum[idx]) + '"></i> ' + meta_data.perc_accum[idx] + '% de ' + meta_data.accumulated[idx].toLocaleString() + ' vacunas <br />Día reciente: ' + meta_data.applied_today[idx].toLocaleString() + ' aplicadas'
			: 'Seleccione departamento');
            document.getElementById("id-effectivity").textContent=meta_data.perc_accum[idx];
            document.getElementById("id-today").textContent=meta_data.applied_today[idx].toLocaleString();
            document.getElementById("id-accumulated").textContent=meta_data.accumulated[idx].toLocaleString();
            cum_chart.setTitle({ text: meta_data.column_divip[props.divipola][1] });
        }
	};

	map.attributionControl.addAttribution('Population data &copy; <a href="http://minsalud.gov.co/">Vaccination Data</a>');

	info.addTo(map);

}

function resetHighlight(e) {
    geojson.resetStyle(e.target);
    info.update();
}

function zoomToFeature(e) {
    map.fitBounds(e.target.getBounds());
    var option_place = document.getElementById("place");

    option_place.value = meta_data.column_divip[e.target.feature.properties.divipola][1];
    select_place();
}

function onEachFeature(feature, layer) {
    layer.on({
        mouseover: highlightFeature,
        mouseout: resetHighlight,
        click: zoomToFeature
    });
}

// get color depending on population density value
function getColor(d) {
    return d*11/100 > GRADIENT_COLORS.length ? ERROR_COLOR : GRADIENT_COLORS[parseInt(d*11/100)];
}

function style(feature) {
    return {
        weight: 2,
        opacity: 1,
        color: 'white',
        dashArray: '3',
        fillOpacity: 0.7,
        fillColor: getColor(meta_data.perc_accum[meta_data.column_divip[feature.properties.divipola][0]])
    };
}

function highlightFeature(e) {
    var layer = e.target;

    target_to_clean = e.target;

    layer.setStyle({
        weight: 5,
        color: '#666',
        dashArray: '',
        fillOpacity: 0.7
    });

    if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
        layer.bringToFront();
    }

    info.update(layer.feature.properties);
}


function get_place_names(data) {
    var columns = data[0].length;
    var option_place = document.getElementById("place");

    for (var i=5; i < columns; i++){
        var option = document.createElement("option");
        option.text = data[NAME_ROW][i];
        if (meta_data.applied_today[i] < 10)
            option.style = "color:red";
        option_place.add(option);
        meta_data.column_names[option.text] = [i, data[DP_ROW][i]];
        meta_data.column_divip[data[DP_ROW][i]] = [i, data[NAME_ROW][i]];
    }
    meta_data.population = data[POP_ROW].map(x => Number(x) ? parseInt(x) : x);
    meta_data.dept_names = [...data[NAME_ROW]];

    var i = data.length - 1;
    for (; i >= 0; i--){
        if(data[i][OPERATION] == -1){
            break;
        }
    }
    if (i >= 0) {
        meta_data.latest_vac = data[i].map(x => Number(x) ? parseInt(x) : x);
    }

    var i = data.length - 1;
    for (; i >= 0; i--){
        if(data[i][OPERATION] == 2){
            break;
        }
    }
    if (i >= 0) {
        meta_data.inmunized = data[i].map(x => Number(x) ? parseInt(x) : x);
    }

}

function select_place(){
    var option_place = document.getElementById("place");
    var i_col = meta_data.column_names[option_place.value][0];

    cum_chart.setTitle({ text: option_place.value });

    if (target_to_clean)
        resetHighlight({ target: target_to_clean});

    if (option_place.value in meta_data.layers) {
        highlightFeature({ target: meta_data.layers[option_place.value]});
        map.flyToBounds(meta_data.layers[option_place.value].getBounds());
    }
    else {
        if (option_place.value in map_views)
            map.flyTo(map_views[option_place.value][0], map_views[option_place.value][1]);
        info.update({ 'divipola': meta_data.column_names[option_place.value][1]});
    }

    update_chart(i_col);
}

function update_chart(i_col) {
    var row = [];
    var applied = [];
    var accum = [];
    var remain = [];
    var effectivity = [];


    for (r=0; r < array.length; r++){
        if (array[r][2] == "-1") {
            var ele = [array[r][0], parseInt(array[r][i_col] || 0)];
            row.push(ele); 
        }
    }
    for (r=0; r < array_2.length; r++){
        if (array_2[r][2] == "Acumuladas") {

            var ele = [array_2[r][0], parseInt(array_2[r][i_col] || 0)];
            accum.push(ele);
        }
        else if (array_2[r][2] == "Aplicadas") {
            var ele = [array_2[r][0], parseInt(array_2[r][i_col] || 0)];
            applied.push(ele);
            accum[accum.length - 1][1] -= ele[1];
        }
        else if (array_2[r][2] == "Remanente") {
            var ele = [array_2[r][0], parseInt(array_2[r][i_col] || 0)];
            remain.push(ele);
        }
        else if (array_2[r][2] == "Eficiencia") {
            var ele = [array_2[r][0], parseInt(array_2[r][i_col] || 0)];
            effectivity.push(ele);
        }

    }
    cum_chart.series[1].setData(row);
    cum_chart.series[0].setData(remain);
    day_chart.series[0].setData(applied);
}

function clean_data(){
    // Avoiding to show inconsistent data.  Tries to make sure we have
    // data for both tiles of the spreadsheet
    var last_orig = array.length -1;
    var last_summ = array_2.length - 1;
}

function closedialog() {
    document.getElementById("loading").style.display = "none";
}

function closeoverlay() {
    document.getElementById("overlay-thing").style.display = "none";
}


function processSheetsData(response) {
    var sheets = response.result;
    var rows = sheets.valueRanges[ID_ORIG].values.length;
    var row = []
    var length = 0;

    for (var r = INI_VALUES; r < rows; r++) {
      row = [];
      length = sheets.valueRanges[ID_ORIG].values[r].length;
      for (var c = 0; c < length; c++) {
        row.push(sheets.valueRanges[ID_ORIG].values[r][c]);
      }
      array.push(row);
    }

    rows = sheets.valueRanges[ID_SUMM].values.length;
    for (var r = INI_VALUES; r < rows; r++) {
        row = [];
        length = sheets.valueRanges[ID_SUMM].values[r].length;
        for (var c = 0; c < length; c++) {
          row.push(sheets.valueRanges[ID_SUMM].values[r][c]);
        }
        array_2.push(row);
    }

    rows = sheets.valueRanges[ID_PLAN].values.length;
    for (var r = 1; r < rows; r++) {
        row = [];
        length = sheets.valueRanges[ID_PLAN].values[r].length;
        for (var c = 0; c < length; c++) {
          row.push(sheets.valueRanges[ID_PLAN].values[r][c]);
        }
        meta_data.goal.push(row);
    }

    rows = sheets.valueRanges[ID_ASSI].values.length;
    for (var r = 1; r < rows; r++) {
        row = [];
        length = sheets.valueRanges[ID_ASSI].values[r].length;
        for (var c = 0; c < length; c++) {
          row.push(sheets.valueRanges[ID_ASSI].values[r][c]);
        }
        meta_data.assignations.push(row);
    }

    clean_data();
    text_dialog = sheets.valueRanges[ID_ORIG].values[8][2];
    var i = sheets.valueRanges[ID_SUMM].values.length - 1;
    for (; i >= 0; i--){
        if(sheets.valueRanges[ID_SUMM].values[i][OPERATION] == PERC_APPLIED){
            break;
        }
    }
    if (i >= 0) {
        meta_data.perc_accum = sheets.valueRanges[ID_SUMM].values[i].map(x => Number(x.replace(/\%$/, '')) ? parseFloat(x): x);
    }

    i = sheets.valueRanges[ID_SUMM].values.length - 1;
    for (; i >= 0; i--){
        if(sheets.valueRanges[ID_SUMM].values[i][OPERATION] == ACCUMULATED){
            break;
        }
    }
    if (i >= 0) {
        meta_data.accumulated = sheets.valueRanges[ID_SUMM].values[i].map(x => Number(x) ? parseInt(x): 0);
    }

    i = sheets.valueRanges[ID_SUMM].values.length - 1;
    for (; i >= 0; i--){
        if(sheets.valueRanges[ID_SUMM].values[i][OPERATION] == APPLIED_TODAY){
            break;
        }
    }
    if (i >= 0) {
        meta_data.applied_today = sheets.valueRanges[ID_SUMM].values[i].map(x => Number(x) ? parseInt(x): 0);
    }

    i = sheets.valueRanges[ID_SUMM].values.length - 1;
    for (; i >= 0; i--){
        if(sheets.valueRanges[ID_SUMM].values[i][OPERATION] == TO_APPLY){
            break;
        }
    }
    if (i >= 0) {
        meta_data.to_apply = sheets.valueRanges[ID_SUMM].values[i].map(x => Number(x) ? parseInt(x): 0);
        meta_data.latest_date = sheets.valueRanges[ID_SUMM].values[i][0];
    }

    get_place_names(sheets.valueRanges[ID_ORIG].values);

    prepare_charts();
}

function prepare_charts() {
    let data_ok = [];
    let data_warn = [];

    for (let i=5;i<meta_data.dept_names.length - 1;i++) {
        if (meta_data.applied_today[i]  > meta_data.population[i] * 0.0005) {
            data_ok.push({
                z: meta_data.population[i],
                y: meta_data.applied_today[i] * 10000 / meta_data.population[i],
                x: meta_data.perc_accum[i],
                name: meta_data.dept_names[i],
                full_name: meta_data.dept_names[i],
                today: meta_data.applied_today[i]
            });
        }
        else {
            data_warn.push({
                z: meta_data.population[i],
                y: meta_data.applied_today[i] * 10000 / meta_data.population[i],
                x: meta_data.perc_accum[i],
                name: meta_data.dept_names[i],
                full_name: meta_data.dept_names[i],
                labelText: meta_data.dept_names[i],
                today: meta_data.applied_today[i]
            });

        }
    }

    compare_chart = Highcharts.chart('compare_chart', {

        chart: {
            type: 'bubble',
            plotBorderWidth: 1,
            zoomType: 'xy'
        },

        title: {
            text: 'Alerta de baja vacunación'
        },

        subtitle: {
            text: 'Puede hacer zoom sobre la gráfica'
        },

        accessibility: {
            point: {
                valueDescriptionFormat: '{index}. {point.name}, Población: {point.x}, Aplicadas hoy: {point.y}, Efectividad: {point.z}%.'
            }
        },

        legend: {
            layout: 'vertical',
            align: 'left',
            verticalAlign: 'top',
            x: 30,
            y: 30,
            floating: true,
            backgroundColor: Highcharts.defaultOptions.chart.backgroundColor,
            borderWidth: 1
        },

        xAxis: {
            gridLineWidth: 1,
            title: {
                text: 'Efectividad'
            },
            labels: {
                format: '{value}'
            },
            accessibility: {
                rangeDescription: 'Dosis Aplicadas/Disponibles'
            },
            plotLines: [{
                color: 'black',
                dashStyle: 'dot',
                width: 2,
                value: 80,
                label: {
                    rotation: 270,
                    y: 200,
                    x: 15,
                    style: {
                        fontStyle: 'italic'
                    },
                    text: 'Gobierno Nacional requiere enviar'
                },
                zIndex: 3
            }],
        },

        yAxis: {
            startOnTick: false,
            endOnTick: false,
            title: {
                text: 'Vacunas último día / 10.000 habitantes'
            },
            labels: {
                format: '{value}'
            },
            plotLines: [{
                color: 'black',
                dashStyle: 'dot',
                width: 2,
                value: 5,
                label: {
                    align: 'right',
                    style: {
                        fontStyle: 'italic'
                    },
                    text: 'Baja vacunación',
                    x: 10
                },
                zIndex: 3
            }],
            maxPadding: 0.2,
            accessibility: {
                rangeDescription: 'Range: aplicadas reciente por 10.000 habitantes.'
            }
        },

        tooltip: {
            useHTML: true,
            headerFormat: '<table>',
            pointFormat: '<tr><th colspan="2"><h3 class="text-lg">{point.full_name}</h3></th></tr>' +
                '<tr><th>Efectividad:</th><td>{point.x}%</td></tr>' +
                '<tr><th>Dosis día:</th><td>{point.today}</td></tr>' +
                '<tr><th>Habitantes:</th><td>{point.z}</td></tr>',
            footerFormat: '</table>',
            followPointer: true
        },

        plotOptions: {
            series: {
                dataLabels: {
                    enabled: true,
                    format: '{point.name}'
                }
            }
        },

        series: [{
            name: 'Alerta',
            color: 'rgba(223, 83, 83, .1)',
            data: data_warn
        }, {
            name: 'Normal',
            color: 'rgba(83, 83, 223, .1)',
            data: data_ok
        }]
    });

    cum_chart = Highcharts.chart('accum_chart', {
        chart: {
            type: 'area',
            zoomType: 'xy'
        },
        title: {
            text: "Distribución de vacunas para Colombia"
        },
        yAxis: {
            title: {
                text: 'Cantidad de dosis',
                x: -40
            },
            labels: {
                format: '{value:,.0f}'
            },
            gridLineDashStyle: 'Dash'
        },
        xAxis: [{
            visible: false,
            type: 'datetime',
            labels: {
                overflow: 'justify'
            }
            },
            {
            visible: false,
            type: 'datetime',
            labels: {
                overflow: 'justify'
            }
            },
            {
            visible: true,
            type: 'datetime',
            labels: {
                overflow: 'justify'
            }
            }
        ],
        
        plotOptions: {
            area: {
                stacking: 'normal',
                depth: 100,
                marker: {
                    enabled: false
                },
                states: {
                    inactive: {
                        enabled: false
                    }
                }
            },
            series: {
                fillOpacity: 0.1,
                pointInterval: 86400000, // one day
                pointStart: Date.UTC(2021, 1, 18, 5, 0, 0)
            }
        },
        tooltip: {
            split:true,
            valueSuffix: ''
        },
        series: [{
            xAxis: 1,
            lineColor: 'rgb(200, 190, 140)',
            fillColor: 'rgb(230, 220, 180)',
            color: 'rgb(200, 190, 140)',
            name: "Por aplicar"
        }, {
            xAxis: 2,
            lineColor: 'rgb(120,160,180)',
            color: 'rgb(140,180,200)',
            fillColor: 'rgb(140,180,200)',
            name: "Aplicadas"
        }]
    });

    day_chart = Highcharts.chart('daily_chart', {

        chart: {
            type: 'spline',
            zoomType: 'xy'
        },
        title: {
            text: 'Aplicación Diaria'
        },
        yAxis: {
            title: {
                text: 'Dosis'
            }
        },

        xAxis: {
            type: 'datetime',
            labels: {
                overflow: 'justify'
            }
        },
        plotOptions: {
            spline: {
                lineWidth: 3,
                marker: {
                    enabled: false
                },
                pointInterval: 86400000, // one day
                pointStart: Date.UTC(2021, 1, 18, 5, 0, 0)
            },
        },

        series: [{
            name: 'Dosis'
        }],

        responsive: {
            rules: [{
                condition: {
                    maxWidth: 500
                },
                chartOptions: {
                    legend: {
                        layout: 'horizontal',
                        align: 'center',
                        verticalAlign: 'bottom'
                    }
                }
            }]
        }

    });

    var resolutions = meta_data.assignations.reduce((accum, x) => accum + `
    <tr>
        <td>${ x[0] }</td>
        <td><a class="underline" target="_blank" href="${ x[5] }">${ x[1] }</a></td>
        <td>${ parseInt(x[2]).toLocaleString() }</td>
    </tr>
    `, '' );

    document.getElementById("id_assignations").innerHTML = resolutions;

    console.log(resolutions)

    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);
    var option_place = document.getElementById("place");
    var remaining = array_2[array_2.length - 1];
    var efficiency = array_2[array_2.length - 2];
    var applied = meta_data.applied_today[meta_data.applied_today.length - 1];
    var accumulated = array_2[array_2.length - 4];
    var goal = meta_data.goal[0];
    var today = meta_data.applied_today;
    var inmunized = meta_data.inmunized;

    colombia = remaining.length - 1;

    document.getElementById("id-doze").textContent = (parseInt(accumulated[colombia]) - parseInt(remaining[colombia])).toLocaleString();
    document.getElementById("id-latest-date").textContent = meta_data.latest_date;
    document.getElementById("id-goal").textContent = parseInt(goal[colombia]).toLocaleString();
    document.getElementById("id-inmunized").textContent = parseInt(inmunized[colombia]).toLocaleString();
    document.getElementById("id-percgoal").textContent = (100 * parseInt(inmunized[colombia])/parseInt(goal[colombia])).toFixed(1).toLocaleString();

    if (urlParams.get('place') in meta_data.column_names) {
        option_place.value = urlParams.get('place');
    }
    else {
        option_place.value = "Colombia";
    }

    var idx_place = meta_data.column_names[option_place.value][0];
    document.getElementById("id-effectivity").textContent=meta_data.perc_accum[idx_place];
    document.getElementById("id-today").textContent=meta_data.applied_today[idx_place].toLocaleString();
    document.getElementById("id-accumulated").textContent=meta_data.accumulated[idx_place].toLocaleString();

    select_place();

    geojson = L.geoJson(statesData, {
		style: style,
		onEachFeature: onEachFeature
	}).addTo(map);

    geojson.eachLayer(function(l){meta_data.layers[meta_data.column_divip[l.feature.properties.divipola][1]] = l});
    document.getElementById("close-dialog").disabled = false;
    document.getElementById("close-dialog").style.display = "block";
    document.getElementById("id-maincall").innerHTML = text_dialog;
    document.getElementById("id-head-maincall").innerHTML = "¡Comparte este tablero!";
    fill_estimated_dates();
    console.log("Glad your here, let's meet at Github");
}

Date.prototype.addDays = function(days) {
    var date = new Date(this.valueOf());
    date.setDate(date.getDate() + days);
    return date;
}

function formatDate(date) {
    var d = new Date(date),
        month = '' + (d.getMonth() + 1),
        day = '' + d.getDate(),
        year = d.getFullYear();

    if (month.length < 2)
        month = '0' + month;
    if (day.length < 2)
        day = '0' + day;

    return [year, month, day].join('-');
}

function fill_estimated_dates() {
    var today_raw = alasql(`SELECT [0] AS m FROM ? WHERE [2] = "-1" ORDER BY [0] DESC`, [array] )[0].m;
    var applied_today = parseInt(alasql(`SELECT [${ colombia }] AS m FROM ? WHERE [2] = "Aplicadas" AND [0] = "${ today_raw }"`, [array_2] )[0].m);
    var mean_applied = parseInt(alasql(`SELECT avg(cast([${ colombia }] as int)) AS m FROM ? WHERE [2] = "Aplicadas"`, [array_2] )[0].m);

    var today = new Date(today_raw);
    var accumulated = alasql(`SELECT [${ colombia }] AS m FROM ? WHERE [2] = "-1" AND [0] = "${ today_raw }"`, [array] )[0].m;
    var max_applied = alasql(`SELECT max(cast([${ colombia }] as int)) AS m FROM ? WHERE [2] = "Aplicadas"`, [array_2] )[0].m;
    var first_date = alasql('SELECT [0] AS m FROM ? WHERE [2] = "-1" LIMIT 1', [array] )[0].m;
    var bought_vaccines = 61500000;
    var remaining = bought_vaccines - accumulated;
    var optimistic_date = today.addDays(parseInt(remaining/ max_applied));
    var expectation_date = today.addDays(parseInt(remaining/ applied_today));
    var mean_date = today.addDays(parseInt(remaining/ mean_applied));

    document.getElementById("id-optimistic-date").innerHTML = formatDate(optimistic_date);
    document.getElementById("id-maximum-applied-projection").innerHTML = max_applied.toLocaleString();
    document.getElementById("id-expectation-date").innerHTML = formatDate(expectation_date);
    document.getElementById("id-today-applied-projection").innerHTML = applied_today.toLocaleString();
    document.getElementById("id-mean-date").innerHTML = formatDate(mean_date);
    document.getElementById("id-today-mean-projection").innerHTML = mean_applied.toLocaleString();
    document.getElementById("id-goal-vaccines").innerHTML = bought_vaccines.toLocaleString();
}

function changeActiveTab(event,tabID){
    let element = event.target;
    while(element.nodeName !== "A"){
      element = element.parentNode;
    }
    ulElement = element.parentNode.parentNode;
    aElements = ulElement.querySelectorAll("li > a");
    tabContents = document.getElementById("tabs-id").querySelectorAll(".tab-content > div");
    for(let i = 0 ; i < aElements.length; i++){
      aElements[i].classList.remove("text-white");
      aElements[i].classList.remove("bg-blue-600");
      aElements[i].classList.add("text-blue-600");
      aElements[i].classList.add("bg-white");
      tabContents[i].classList.add("hidden");
      tabContents[i].classList.remove("block");
    }
    element.classList.remove("text-blue-600");
    element.classList.remove("bg-white");
    element.classList.add("text-white");
    element.classList.add("bg-blue-600");
    document.getElementById(tabID).classList.remove("hidden");
    document.getElementById(tabID).classList.add("block");
  }


function funnel_setup(){
    Highcharts.chart('container-funnel', {
        chart: {
            type: 'funnel'
        },
        title: {
            text: 'Ejecución plan de vacunación'
        },
        plotOptions: {
            series: {
                dataLabels: {
                    enabled: true,
                    format: '<b>{point.name}</b> ({point.y:,.0f})',
                    softConnector: true
                },
                center: ['40%', '50%'],
                neckWidth: '30%',
                neckHeight: '25%',
                width: '80%'
            }
        },
        legend: {
            enabled: false
        },
        series: [{
            name: 'Dosis',
            data: [
                ['Requeridas', 1691366 * 2],
                ['Compradas', 61500000],
                ['Recibidas', 1500000],
                ['Asignadas', 400000],
                ['Aplicadas', 200000],
                ['Inmunización', 0]
            ]
        }],
    
        responsive: {
            rules: [{
                condition: {
                    maxWidth: 500
                },
                chartOptions: {
                    plotOptions: {
                        series: {
                            dataLabels: {
                                inside: true
                            },
                            center: ['50%', '50%'],
                            width: '100%'
                        }
                    }
                }
            }]
        }
    });
}