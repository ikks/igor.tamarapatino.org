var zoom=17;
var urlbase='//igor.tamarapatino.org/js/moinmoin-osm/'
var imaicon=urlbase+"img/mark.png";
var icon = new OpenLayers.Icon(imaicon);
var epsg4326 = new OpenLayers.Projection("EPSG:4326");
var epsg900913 = new OpenLayers.Projection("EPSG:900913");
var mapnik = new OpenLayers.Layer.OSM.Mapnik("Mapnik", {
      displayOutsideMaxExtent: true,
      wrapDateLine: true});
var cyclemap = new OpenLayers.Layer.OSM.CycleMap("Cycle Map", {
      displayOutsideMaxExtent: true,
      wrapDateLine: true});
var numZoomLevels = 20;

OpenLayers._getScriptLocation = function () {
   return urlbase+"openlayers/";
}


function add_map(name,lat,lon,myzoom) {
	/* Retorna un nuevo mapa centrado en lat,lon con una marca en el centro
	 * name : string para el nombre del div id_name y el mapa map_name
	 * lat : float con latitud 
	 * lon : float con longitud
	 */

   myzoom = typeof(imageicon)!="undefined" ? dzoom : zoom;
   var map = new OpenLayers.Map ("map_"+name, {
       controls:[
          new OpenLayers.Control.Navigation(),
          new OpenLayers.Control.PanZoomBar()],
       maxExtent: new OpenLayers.Bounds(-20037508.34,-20037508.34,20037508.34,20037508.34),
       maxResolution: 156543.0399,
       units: 'm',
       projection: epsg900913,
       displayProjection: epsg4326
   });
   map.addLayer(mapnik);
   map.addLayer(cyclemap);
   marker_layer = new OpenLayers.Layer.Markers("Markers", {
       displayInLayerSwitcher: false,
       numZoomLevels: numZoomLevels,
       maxExtent: new OpenLayers.Bounds(-20037508,-20037508,20037508,20037508),
       maxResolution: 156543,
       units: "m",
       projection: "EPSG:900913"
   });
   map.addLayer(marker_layer);
   map.setCenter(new OpenLayers.LonLat(lon,lat).transform(epsg4326, epsg900913), myzoom);
   marker = new OpenLayers.Marker(new OpenLayers.LonLat(lon,lat).transform(epsg4326, epsg900913),icon);
   marker_layer.addMarker(marker);
   move_handler = function () {
       marker_layer.clearMarkers();
       center=map.getCenter();
       marker_layer.addMarker(new OpenLayers.Marker(center,icon));
       c=center.clone().transform(map.getProjectionObject(), epsg4326);
       $("#"+name+"_id")[0].value = c.lat+","+c.lon;
       }
   map.events.register("move", map, move_handler);
   center = map.getCenter().clone().transform(map.getProjectionObject(), epsg4326);
   $("#"+name+"_id")[0].value = center.lat+","+center.lon;
   map.addControl(new OpenLayers.Control.MousePosition());
   return map;
}


function my_map(name,places,imageicon,dzoom) {
	/* Retorna un nuevo mapa con varios lugares
	 * name : string with the name of the div where the map will reside
	 * places : array of objects whit .lon and .lat
	 * imageicon : URL o PATH  con la imagen para el Icono, si no estA presente
	 *   se emplea el Icono predeterminado.
	 */
   icon = typeof(imageicon)!="undefined" ? new OpenLayers.Icon(imageicon) : icon;
   myzoom = typeof(imageicon)!="undefined" ? dzoom : zoom;
   var map = new OpenLayers.Map (name, {
       controls:[
          new OpenLayers.Control.Navigation(),
          new OpenLayers.Control.PanZoomBar()],
       maxExtent: new OpenLayers.Bounds(-20037508.34,-20037508.34,20037508.34,20037508.34),
       maxResolution: 156543.0399,
       units: 'm',
       projection: epsg900913,
       displayProjection: epsg4326
   });
   map.addLayer(mapnik);
   map.addLayer(cyclemap);
   marker_layer = new OpenLayers.Layer.Markers("Markers", {
       displayInLayerSwitcher: false,
       numZoomLevels: numZoomLevels,
       maxExtent: new OpenLayers.Bounds(-20037508,-20037508,20037508,20037508),
       maxResolution: 156543,
       units: "m",
       projection: "EPSG:900913"
   });
   map.addLayer(marker_layer);
   map.setCenter(new OpenLayers.LonLat(places[0].lon,places[0].lat).transform(epsg4326, epsg900913), myzoom);
   for (var m in places) {
      marker_layer.addMarker(new OpenLayers.Marker(new OpenLayers.LonLat(places[m].lon,places[m].lat).transform(epsg4326, epsg900913),icon.clone()));
   }
   return map;
}
