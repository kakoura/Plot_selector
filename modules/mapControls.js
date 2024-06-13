import L, { polygon } from 'leaflet';
import "leaflet-draw/dist/leaflet.draw.css";
import 'leaflet-draw';
import dict from '../data/dictionary.json';
import $ from "jquery";
import Mustache from 'mustache';

// import _ from 'underscore'
import { getLiteral } from './util.js';
import { Mimapa } from './map.js';
import { prepararDescarga,downloadDataPol } from './download.js';
import { Sesion, Layers} from '../main.js';
import { cardTemplate } from '../data/htmlTemplates.js';
import bootstrap from "bootstrap/dist/js/bootstrap.bundle.min.js";
import { handlerNombreCientifico, visualizarFiltrosTaxon,handlerFiltrarTaxon} from './taxons.js';
import { ajustarLugarfocus,obtenerSugerenciasLugares,renderSugerenciasLugares } from './places.js';
import { plotSpecies } from './plots.js';
import { updateTotalPlots, calculateTotalPlots, clickedProvinces} from './provinces.js';

let drawControl;

let polygonDataDictionary = {};
let polygonList=[]; 



function cargarPanel() {
	//  panel de control de info
	let panelInfo = L.control({'position':'topleft'});
	panelInfo.onAdd = function (map) {
		// creo div con clase "card" de bootstrap
		this._div = L.DomUtil.create('div', 'card ms-1 ms-sm-2 mt-1 mt-sm-2 panel-control');	// versión 5.3 bootstrap
		return this._div;
	};

	panelInfo.init = function () {
		// inicializo el panel con el nombre científico
		const obj = { nomci: Sesion.nomci };
		const cardhtml = Mustache.render(cardTemplate, obj);
		$(".panel-control").html(cardhtml);

		$(".nomci").change(handlerNombreCientifico);
		
		$("#in_lugares").on("keyup search", async function(e) {				
			// trato las teclas de arriba, abajo y enter			
			if (e.which == 13) { // tecla ENTER
				// sólo actúo si hay al menos una sugerencia (y habilitada)
				if ($("#sugelugares").children(":enabled").length > 0) {
					// si no había ninguna sugerencia seleccionada activo la primera
					if (Sesion.lugarfocus == -1) {
						Sesion.lugarfocus = 0;
						ajustarLugarfocus();
					}
					// y ahora vamos al lugar seleccionado
					$("#sugelugares").children(":enabled").eq(Sesion.lugarfocus).click();
				}
			}
			else if (e.which == 40) { // tecla ABAJO			
				// incremento focus
				Sesion.lugarfocus++;
				ajustarLugarfocus();				
			}
			else if (e.which == 38) { // tecla ARRIBA
				// decremento focus
				Sesion.lugarfocus--;
				ajustarLugarfocus();
			}
			else if (e.which != undefined) { // caso normal
				// si había marcador de municipio, lo quito
				if (Sesion.lugarmarker != null) {
					Sesion.lugarmarker.remove();
					Sesion.lugarmarker = null;
					Sesion.lugar = null;
				}
				// actúo según la entrada
				let entrada = $(this).val();
				if (entrada.length == 0) {// no hay entrada
					$("#sugelugares").html("");
					$("#sugelugares").addClass("d-none");
				}
				else {// obtengo sugerencias y hago su render
					$("#sugelugares").removeClass("d-none");
					const sugs = await obtenerSugerenciasLugares(entrada);
					renderSugerenciasLugares(sugs);
					/* TODO
					// mando evento GA si la entrada > 2
					if (entrada.length > 2) {
						sendEvent('search', {
							search_term: entrada,
							content_type: "places"
						});
					}*/
				}
			}
			else  {
				// caso de la X del formulario... (quito las sugerencias y el marcador si lo hay)
				let entrada = $(this).val();
				if (entrada.length == 0) {// no hay entrada
					$("#sugelugares").html("");
					$("#sugelugares").addClass("d-none");
					if (Sesion.lugarmarker != null) {
						Sesion.lugarmarker.remove();
						Sesion.lugarmarker = null;
						Sesion.lugar = null;
					}
				}
			}
		}).focusin(function() {			
			// vuelve el focus, muestro las sugerencias si hay algo
			let entrada = $(this).val();
			if (entrada.length > 0)
				$("#sugelugares").removeClass("d-none");			
		}).focusout(function() {
			// si pierde el focus escondemos las sugerencias tras un delay
			// el delay es importante para que se pueda clickar un botón antes de eliminar las sugerencias
			setTimeout(function(){
				if (!$("#in_lugares").is(":focus")) // si vuelve el focus no escondo
					$("#sugelugares").addClass("d-none");
			}, 300);			
		});

		// handler de taxón
		$("#bot_taxones").click(handlerFiltrarTaxon);
	};
	
	panelInfo.addTo(Mimapa);
	
	// si es terminal táctil desactivo los eventos de dragging del mapa en el panel del formulario
    if (('ontouchstart' in window) || (navigator.MaxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0)) {
    	panelInfo.getContainer().addEventListener('touchstart', function () {
    		Mimapa.dragging.disable();
    	}); 
    	panelInfo.getContainer().addEventListener('touchend', function () {
    		Mimapa.dragging.enable();
    	});
    } else { // para terminales no táctiles desactivo los listeners del mapa al entrar en el panel del formulario
    	// Disable dragging, scrollWheelZoom and doubleClickZoom when user's cursor enters the element
		panelInfo.getContainer().addEventListener('mouseover', function () {
			Mimapa.dragging.disable();
			Mimapa.scrollWheelZoom.disable();
			//Mimapa.doubleClickZoom.disable();
		});
		// Re-enable dragging, scrollWheelZoom and doubleClickZoom when user's cursor leaves the element
		panelInfo.getContainer().addEventListener('mouseout', function () {
			Mimapa.dragging.enable();
			Mimapa.scrollWheelZoom.enable();
			//Mimapa.doubleClickZoom.enable();
		});
    }
	
	// inicializo panel
	panelInfo.init();

}




function cargarBotonesMapa() {
	// preparo botón de descarga con Leaflet Draw
	
	

	Layers.editableLayer = new L.FeatureGroup();
	Mimapa.addLayer(Layers.editableLayer);    
	const ldo = {
		position: 'bottomright',
		draw: {
			polyline: false,
			polygon: {
				allowIntersection: false, // Restricts shapes to simple polygons
				drawError: {
					//color: '#e1e100', // Color the shape will turn when intersects
					message: getLiteral(dict.errorPolygon)
				},
				shapeOptions: {
					//color: '#bada55'
				}
			},
			circle: false, // Turns off this drawing tool
			rectangle: false,
			marker: false,
			circlemarker: false
		},
		edit: false
	};

    drawControl = new L.Control.Draw(ldo);
	Mimapa.addControl(drawControl);
	// Show the infoDiv when drawing starts
	Mimapa.on('draw:drawstart', function() {
		const toastEl = document.getElementById('mitostada');
		const msg=document.getElementById("mitostadaBody");
		msg.innerHTML="Draw a polygon to download plots"
		const toast = new bootstrap.Toast(toastEl);

		toast.show();
		
	});
	Mimapa.on(L.Draw.Event.CREATED, function (e) {
		// actualizo flag
		Sesion.poligonero = false;
		// actualizo aspecto botón (sin pulsar)
		$(".download").removeAttr("style");
		$(".download span").removeAttr("style");
		// añado el polígono a la capa editable
		Layers.editableLayer.addLayer(e.layer);		
		// desde aquí llamo a la descarga de datos
		// prepararDescarga();
		// Call the downloadDataPol function with the polygon bounds
		const polygonBounds = e.layer.getBounds();
		const currentID = getNextAvailableID(polygonList);  // Get the next available ID
		const polygonPop = `Polygon ${currentID}`;

		// Bind a popup to the polygon
		e.layer.bindPopup(`<b>${polygonPop}</b>`).openPopup();

        downloadDataPol(polygonBounds)
        .then((polygonPlots) => {
			const polygonKey = `Polygon ${currentID}`;
            polygonDataDictionary[polygonKey] = polygonPlots;

            const displayDiv = document.getElementById('clickedProvinces');
            const polygonDiv = document.createElement('div');
			polygonDiv.textContent = polygonKey;
            polygonDiv.className = 'province-item';
            displayDiv.appendChild(polygonDiv);
			
			
			// console.log(Layers.editableLayer)
			// console.log(e.layer);

            const unclickButton = document.createElement('button');
            unclickButton.className = 'unclick-button';
            unclickButton.textContent = 'X';
            unclickButton.onclick = function() {
                Layers.editableLayer.removeLayer(e.layer);
                polygonList = polygonList.filter(p => p.id !== currentID);
                delete polygonDataDictionary[polygonKey];
                displayDiv.removeChild(polygonDiv);
				const provinceIndex = clickedProvinces.findIndex(([name]) => name === polygonKey);
            	clickedProvinces.splice(provinceIndex, 1);
				updateTotalPlots();
				// console.log(clickedProvinces)
				console.log(polygonDataDictionary);
            };
            polygonDiv.appendChild(unclickButton);

			console.log(polygonDataDictionary);
			clickedProvinces.push([polygonKey, polygonDataDictionary[polygonKey].NumberOfPlots]);
            // console.log(clickedProvinces);
			updateTotalPlots();
        })
        .catch(error => {
            console.error('Error downloading data:', error);
            // Optionally, handle errors such as by displaying an alert or logging to a user interface
        });
		polygonList.push({
            id: currentID,
            layer: e.layer,
            bounds: polygonBounds
        });
    });

	
}

function getNextAvailableID(polygonList) {
    if (polygonList.length === 0 ) return 1;
    let idSet = new Set(polygonList.map(p => p.id));
    let currentID = 1;
    while (idSet.has(currentID)) {
        currentID++;
    }
    return currentID;
}

export{cargarBotonesMapa, cargarPanel,polygonDataDictionary,polygonList}