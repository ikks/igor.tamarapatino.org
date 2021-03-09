google.charts.load('current');
google.charts.setOnLoadCallback(init);

var data;
var data_2;
var column_names = {};
var day_chart;
var cum_chart;
var array;
var array_2;

function init() {
  var url =
    'https://docs.google.com/spreadsheets/d/1z2KYfMvDMLHb3f1xQMDHM5Q9ll_vIwe764XBBQF7P2E/edit#gid=0';
  var query = new google.visualization.Query(url);
  query.setQuery('select * limit 100');
  query.send(processSheetsData);
}

function get_place_names(data) {
    var columns = data.getNumberOfColumns();
    var option_place = document.getElementById("place");

    for (var i=5; i < columns; i++){
        var option = document.createElement("option");
        option.text = data.getColumnLabel(i);
        option_place.add(option);
        column_names[option.text] = i;
    }
}

function select_place(){
    var option_place = document.getElementById("place");
    var i_col = column_names[option_place.value];

    cum_chart.setTitle({ text: option_place.value });

    update_chart(i_col);
}

function update_chart(i_col) {
    var row = [];
    var applied = [];
    var accum = [];
    var remain = [];
    var effectivity = [];

    for (r=3; r < array.length; r++){
        if (array[r][2] == "-1") {
            var ele = [array[r][0], parseInt(array[r][i_col] || 0)];
            row.push(ele); 
        }
    }
    for (r=3; r < array_2.length; r++){
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

function processSheetsData(response) {
    var url =
    'https://docs.google.com/spreadsheets/d/1z2KYfMvDMLHb3f1xQMDHM5Q9ll_vIwe764XBBQF7P2E/edit?gid=1933730809';

    array = [];
    data = response.getDataTable();

    var columns = data.getNumberOfColumns();
    var rows = data.getNumberOfRows();
    
    
    get_place_names(data)
    
    for (var r = 0; r < rows; r++) {
      var row = [];
      for (var c = 0; c < columns; c++) {
        row.push(data.getFormattedValue(r, c));
      }
      array.push(row);
    }

    var query = new google.visualization.Query(url);
    query.setQuery('select * limit 1000');
    query.send(initialize_graph);
}

function initialize_graph(response) {
    array_2 = [];
    data_2 = response.getDataTable();
    var columns = data_2.getNumberOfColumns();

    var rows = data_2.getNumberOfRows();
    for (var r = 0; r < rows; r++) {
        var row = [];
        for (var c = 0; c < columns; c++) {
          row.push(data_2.getFormattedValue(r, c));
        }
        array_2.push(row);
    }

    cum_chart = Highcharts.chart('accum_chart', {
        chart: {
            type: 'area'
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
            visible: true
        }, {
            visible: false
        }, {
            visible: false
        }],
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
                fillOpacity: 0.1
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
            type: 'spline'
        },
        title: {
            text: 'Aplicación Diaria'
        },
        yAxis: {
            title: {
                text: 'Dosis'
            }
        },

        xAxis: [{
            visible: false
        }],

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
    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);
    var option_place = document.getElementById("place");
    if (urlParams.get('place') in column_names) {
        option_place.value = urlParams.get('place');
    }
    else {
        option_place.value = "Colombia";
    }
    select_place();
    funnel_setup();
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
                ['Compradas', 4000000],
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