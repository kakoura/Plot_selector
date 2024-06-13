import config from '../data/config.json';
import dict from '../data/dictionary.json';

import 'leaflet.locatecontrol';
import L from 'leaflet';
import 'leaflet-draw';
import _ from 'underscore';
import $ from "jquery";

import { Sesion, Layers, obtenerURL } from '../main.js';
import { getLiteral} from './util.js';
import { getGrid, getGridBounds } from './grid.js';
// import { processPatchCell, processPlotCell } from './dataManager.js';
import { cargarProvincias, quitarProvincias } from './provinces.js';
import { pintarTeselas, quitarTeselas } from './patches.js';
import { pintarParcelas, quitarParcelas } from './plots.js';
import { pintarArboles, quitarArboles } from './trees.js';

let Mimapa, Mitilelayer,terrainLayer;
// Initialize the map
function initializeMap() {
    // Set up map options
    const mapOptions = {
        maxBounds: config.geoMaxBounds,
        geoMaxBoundsViscosity: config.geoMaxBoundsViscosity,
        zoomControl: false,
        tap: false,
        doubleClickZoom: false,
        scrollWheelZoom: 'center',
        wheelDebounceTime: 100,
        preferCanvas: true
    };

    // Initialize the map
    Mimapa = L.map('mimapa', mapOptions)
        .setView([Sesion.estado.loc.lat, Sesion.estado.loc.lng], Sesion.estado.loc.z);

    // Get base tile layer configuration
    const gc = obtenerConfigMapaBase(Sesion);

    // Create and add base tile layer to the map
    Mitilelayer = gc.wms ?
        L.tileLayer.wms(gc.url, gc.options).addTo(Mimapa) :
        L.tileLayer(gc.url, gc.options).addTo(Mimapa);

    	// REPOSICIONO CONTROLES DE ZOOM Y MUESTRO ESCALA DEL MAPA
	L.control.scale( {imperial: false, position: 'bottomright'} ).addTo(Mimapa); // sin la escala imperial
	if (!L.Browser.mobile) { // sólo botones de zoom para dispositivos no móviles
		L.control.zoom( { position: 'bottomright',
			zoomInTitle: getLiteral(dict.zoomin),
			zoomOutTitle: getLiteral(dict.zoomout),
		} ).addTo(Mimapa);
	}

	terrainLayer = L.tileLayer('https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}{r}.{ext}', {
        minZoom: 0,
        maxZoom: 18,
        ext: 'png'
    });
	

    // L.control.locate({
	//     position: 'bottomright',
	//     icon: 'bi bi-geo-fill',
	// 	locateOptions: { animate: true, duration: 1 },
	// 	initialZoomLevel: config.zCambioRadio,
	//     flyTo: true,
	//     showPopup: false,
	//     drawCircle: false,
	//     showCompass: true,
    // 	strings: {
    //     	title: getLiteral(dict.mylocation)
	//     }
	// }).addTo(Mimapa);

    // Mimapa.on("locateactivate", function(e) {
	// 	// estilo botón en modo edición
	// 	$(".leaflet-control-locate a").attr("style", "background-color: #6c757d;");
	// 	$(".leaflet-control-locate a span").attr("style", "color: white;");
	// 	//sendEvent( 'select_content', { content_type: 'activate_my_location' } );		TODO!
	// });	
	// Mimapa.on("locatedeactivate", function(e) {
	// 	// estilo botón normal
	// 	$(".leaflet-control-locate a").removeAttr("style");
	// 	$(".leaflet-control-locate a span").removeAttr("style");
	// 	//sendEvent( 'select_content', { content_type: 'deactivate_my_location' } );		TODO!
	// });
}

// Get base tile layer configuration based on session state
function obtenerConfigMapaBase() {
    // Determine base tile layer configuration based on map type
    const mapType = Sesion.estado.mapType || "default"; // Default map type

    // Use Esri satellite tile layer if mapType is "satellite", otherwise use Voyager tile layer (default)
    return mapType === "satellite" ? config.geoConfigs.esri : config.geoConfigs.voyager;
}

function mapaMovido() {
	if (!Sesion.errordataprov) {
		if (Sesion.actualizandoMapa) {
			Sesion.mapaMovido = true; // pendiente de actualizar el mapa...
			console.log("Mapa movido: actualización de mapa pendiente...");
		}
		else // llamo a actualizar el mapa
			
			actualizarMapa();
	}
}

async function actualizarMapa() {
	// si no estoy en modo mapa no continúo con la actualización
	if (Sesion.estado.path !== "map")
		return;		
		
	// desactivo botón de descarga (no se reactivará hasta que termine felizmente finActualizarMapa)
	//$(".download").addClass("disabled");
	
	// actualizo zoom
	const zoomPrevio = Sesion.zoom;
	Sesion.zoom = Mimapa.getZoom();
	console.log(Sesion.zoom);
	// obtengo grid de celdas para el mapa
	// limito el zoom en las celdas para evitar explosión en zooms muy altos que no aportan nada
	const zoomCelda = Sesion.zoom > config.zMaxCelda? config.zMaxCelda : Sesion.zoom;
	Sesion.zoomUsados[zoomCelda] = true; // para el cacheo
	const grid = getGrid(Mimapa.getBounds(), zoomCelda);
	
	// console.log(grid)
	// inicializaciones progreso y estadísticos
	Sesion.infoCeldasTeselas = {
		total: (1 + grid.cellE - grid.cellW) * (1 + grid.cellN - grid.cellS),
		cambioCapa: (zoomPrevio < config.zCambioCapaTeselas && Sesion.zoom >= config.zCambioCapaTeselas) || 
						(zoomPrevio >= config.zCambioCapaTeselas && Sesion.zoom < config.zCambioCapaTeselas),
		mediadas: [],
		finalizadas: [],
		cacheadas: [],
		npc: [], // número de peticiones a crafts
		mostrar: false // preinicializo
	};
	Sesion.infoCeldasParcelas = {
		total: (1 + grid.cellE - grid.cellW) * (1 + grid.cellN - grid.cellS),
		mediadas: [],
		finalizadas: [],
		cacheadas: [],
		npc: [], // número de peticiones a crafts
		modoArbol: Sesion.zoom >= config.zArbol,
		mostrar: Sesion.estado.plots && Sesion.zoom >= config.zParcela
	};
	//console.warn("Total celdas: " + Sesion.infoCeldasTeselas.total); // TODO

	
	// inicialización primordial
	inicioActualizarMapa();
	const idtimeout = Sesion.idTimeoutActualizar;
	
	// array de promesas global
	let promesas = [];
		
	/* TODO: pinto
	for (let x=grid.cellW; x<=grid.cellE; x++) {
		for (let y=grid.cellS; y<=grid.cellN; y++) {
			const cb = getCeldaBounds(x, y, Sesion.zoom);
			L.rectangle(cb, {color: "#ff7800", weight: 1}).addTo(Mimapa);
		}
	}*/	
	
	/*
	// aquí hay que detectar qué mostrar
	// depende del nivel del zoom y de algunas opciones (PASAR POR URL)
	const mostrarProvs = true; // TODO
	//const mostrarTeselas = false; // TODO
	const mostrarParcelas = false; // TODO
	const mostrarArboles = false; // TODO
	
	*/
	
	//
	// PROVINCIAS
	// //
	// detecto si hay que mostrar las provincias o no
	console.log("Sesion.estado.map: ",Sesion.estado.mapDetails);
	if (Sesion.estado.mapDetails === "regions" || (Sesion.estado.mapDetails === "auto" && Sesion.zoom < config.zParcela)){

		cargarProvincias(true);
		if (Mimapa.hasLayer(terrainLayer)) {
            Mimapa.removeLayer(terrainLayer);
        }
	
	}
	else{
		quitarProvincias();
		Mimapa.addLayer(terrainLayer);
	}
	
	
	// /*
	// //
	// // MUNICIPIOS
	// //
	// // detecto si hay que mostrar los municipios o no
	// // en modo automático con el mapa base satélite muestro los municipios a partir del zoom config.zParcela
	// if (Sesion.estado.mapDetails === "munis" || (Sesion.estado.mapDetails === "auto" && Sesion.estado.mapType === "satellite" && Sesion.zoom >= config.zParcela))
	// 	cargarMunis(true);
	// else
	// 	quitarMunis();*/
		
	// //
	// // TESELAS
	// //
	// // detecto si hay que mostrar las teselas
	// //if (Sesion.estado.layer === "landcover")
	// if (Sesion.estado.mapDetails === "patches" || 
	// 		(Sesion.estado.mapDetails === "auto" && Sesion.estado.mapType === "default" && Sesion.zoom >= config.zParcela))
	// 	Sesion.infoCeldasTeselas.mostrar = true;
	// // procesamiento teselas	
	// if (!Sesion.infoCeldasTeselas.mostrar)
	// 	quitarTeselas(); // fuera teselas del mapa
	// else {
	// 	// trabajo celda a celda
	// 	for (let x=grid.cellW; x<=grid.cellE; x++) {
	// 		for (let y=grid.cellS; y<=grid.cellN; y++) {
	// 			// preparo objeto de la celda
	// 			const objcelda = {
	// 				zoom: zoomCelda,
	// 				cellX: x,
	// 				cellY: y,
	// 				npc: [], // inicializo array con número de peticiones a crafts
	// 				et: 'z' + zoomCelda + '_x' + x + '_y' + y,
	// 				idtimeout: idtimeout // para actualizar Sesion.infoCeldasTeselas sólo si toca
	// 			};
	// 			// enchufo el progreso
	// 			objcelda.progreso = pintarBarraProgreso;
	// 			// enchufo el render
	// 			objcelda.render = function(turis) {
	// 				// sólo hago el rendering si me toca (objcelda.idtimeout es el mismo que Sesion.idTimeoutActualizar)
	// 				if (Sesion.infoCeldasTeselas.mostrar && objcelda.idtimeout == Sesion.idTimeoutActualizar) {
	// 					// pinto teselas de la celda
	// 					pintarTeselas(turis);
	// 				}
	// 			};
	// 			// hago la petición de datos
	// 			promesas.push( processPatchCell(objcelda) );
	// 		}
	// 	}
		
	// 	// limpieza de teselas si hay cambio de capa y si no borro las teselas no visibles
	// 	if (Sesion.infoCeldasTeselas.cambioCapa) {
	// 		quitarTeselas();
	// 		delete Sesion.infoCeldasTeselas.cambioCapa; // no hace falta repetir
	// 	}
	// 	else {
	// 		console.time("Borrado de teselas");		
	// 		const gridBounds = getGridBounds(grid, zoomCelda);
	// 		let turisBorrar = [];
	// 		for (let turi in Sesion.tesPintadas) {
	// 			const tbounds = Sesion.tesPintadas[turi].getBounds();
	// 			if (!gridBounds.intersects(tbounds) && !gridBounds.contains(tbounds) )
	// 				turisBorrar.push(turi);
	//         }
	// 		console.info("#teselas pintadas: " + Object.keys(Sesion.tesPintadas).length + " - #teselas a borrar: " + turisBorrar.length);
	// 		for (let turib of turisBorrar) {
	// 			Layers.tess.removeLayer(Sesion.tesPintadas[turib]);
	// 			delete Sesion.tesPintadas[turib];
	// 		}
	// 		console.timeEnd("Borrado de teselas");
	// 	}
	// }
		
	
	//
	// PARCELAS Y ÁRBOLES
	//	
	// procesamiento parcelas y árboles
	// if (!Sesion.infoCeldasParcelas.mostrar) {
	// 	// fuera parcelas y árboles del mapa
	// 	quitarParcelas();
	// 	quitarArboles();
	// }
	// else {
	// 	// trabajo celda a celda
	// 	for (let x=grid.cellW; x<=grid.cellE; x++) {
	// 		for (let y=grid.cellS; y<=grid.cellN; y++) {
	// 			// preparo objeto de la celda
	// 			const objcelda = {
	// 				zoom: zoomCelda,
	// 				cellX: x,
	// 				cellY: y,
	// 				npc: [], // inicializo array con número de peticiones a crafts
	// 				et: 'z' + zoomCelda + '_x' + x + '_y' + y,
	// 				modoArbol: Sesion.infoCeldasParcelas.modoArbol,
	// 				idtimeout: idtimeout // para actualizar Sesion.infoCeldasTeselas sólo si toca
	// 			};
	// 			// enchufo el progreso
	// 			objcelda.progreso = pintarBarraProgreso;
	// 			// enchufo el render
	// 			objcelda.render = function(puris) {
	// 				// sólo hago el rendering si me toca (objcelda.idtimeout es el mismo que Sesion.idTimeoutActualizar)
	// 				if (Sesion.infoCeldasParcelas.mostrar && objcelda.idtimeout == Sesion.idTimeoutActualizar) {
	// 					if (Sesion.infoCeldasParcelas.modoArbol) // pinto árboles de la celda
	// 						pintarArboles(puris);
	// 					else // pinto parcelas de la celda
	// 						pintarParcelas(puris);
	// 				}
	// 			};
	// 			// hago la petición de datos
	// 			promesas.push( processPlotCell(objcelda) );
	// 		}
	// 	}
		
	// 	// ajuste radio parcela en modo no árbol
	// 	if (!Sesion.infoCeldasParcelas.modoArbol) {		
	// 		// calculo radio para pintar según el zoom
	// 		const radio = Sesion.zoom > config.zCambioRadio? config.radioParcela - (config.radioParcela - config.radioParcelaN3)*(Sesion.zoom - config.zCambioRadio)/(config.zArbol - config.zCambioRadio)
	// 			 : config.radioParcela;
	// 		// si no coincide el radio con el de la sesión, me cargo la capa
	// 		if (radio != Sesion.radioParPintadas)
	// 			quitarParcelas();
	// 		// guardo radio sesión
	// 		Sesion.radioParPintadas = radio;
	// 	}		
		
	// 	// limpieza de árboles y parcelas según el modo
	// 	if (Sesion.infoCeldasParcelas.modoArbol) {
	// 		quitarParcelas();
	// 		// no hago borrado de árboles no visibles porque va a tener escasa utilidad
	// 		// (no voy a poder recorrer mucho terreno con el zoom de árbol, antes pasaré al modo parcela)
	// 	}
	// 	else {
	// 		quitarArboles();			
	// 		// borro parcelas no visibles
	// 		console.time("Borrado de parcelas");
	// 		const gridBounds = getGridBounds(grid, zoomCelda);
	// 		let purisBorrar = [];
	// 		for (let puri in Sesion.parPintadas) {
	// 			const pbounds = Array.isArray(Sesion.parPintadas[puri])? Sesion.parPintadas[puri][0].getBounds() : Sesion.parPintadas[puri].getBounds();
	// 			if (!gridBounds.intersects(pbounds) && !gridBounds.contains(pbounds) )
	// 				purisBorrar.push(puri);
	//         }
	// 		console.info("#parcelas pintadas: " + Object.keys(Sesion.parPintadas).length + " - #parcelas a borrar: " + purisBorrar.length);
	// 		for (let purib of purisBorrar) {
	// 			if (Array.isArray(Sesion.parPintadas[purib])) {
	// 				for (let parelb of Sesion.parPintadas[purib])
	// 					Layers.parcs.removeLayer(parelb);
	// 			}
	// 			else			
	// 				Layers.parcs.removeLayer(Sesion.parPintadas[purib]);
	// 			delete Sesion.parPintadas[purib];
	// 		}			
	// 		console.timeEnd("Borrado de parcelas");			
	// 	}        
	// }	
	
	// // espero a que terminen todas las promesas de las celdas para hacer logging
	// await Promise.all(promesas);	
	
	// // logging celdas si no ha vencido el temporizador de actualización...
	// if (idtimeout == Sesion.idTimeoutActualizar) {
	// 	// logging celdas teselas
	// 	// if (Sesion.infoCeldasTeselas.mostrar) {
	// 	// 	let tcc = _.reduce(Sesion.infoCeldasTeselas.cacheadas, function(memo, num){ return memo + num; }, 0);
	// 	// 	let npc = _.reduce(Sesion.infoCeldasTeselas.npc, function(memo, num){ return memo + num; }, 0);	
	// 	// 	console.info("#celdasTeselas I" + idtimeout  + " total: " + Sesion.infoCeldasTeselas.total + " - cacheadas: " 
	// 	// 		+ tcc + " - #npc: " + npc );
	// 	// }			
	// 	// logging celdas parcelas
	// 	if (Sesion.infoCeldasParcelas.mostrar) {
	// 		let tcc = _.reduce(Sesion.infoCeldasParcelas.cacheadas, function(memo, num){ return memo + num; }, 0);
	// 		let npc = _.reduce(Sesion.infoCeldasParcelas.npc, function(memo, num){ return memo + num; }, 0);	
	// 		console.info("#celdasParcelas I" + idtimeout  + " total: " + Sesion.infoCeldasParcelas.total + " - cacheadas: " 
	// 			+ tcc + " - #npc: " + npc );
	// 	}	
	// 	// TODO GA
	// 	// actualizo info celdas cacheadas para GA
	// 	//addEventData('cached_cells', tcc);			
	// }
		
	// rutina fin actualización del mapa si no ha vencido el temporizador de actualización
	if (idtimeout == Sesion.idTimeoutActualizar) 
		finActualizarMapa();
}

function actualizarMapaBase(gcold) {
	// borro atribuciones del mapa
	for (let clave of Object.keys(Mimapa.attributionControl._attributions))
		Mimapa.attributionControl.removeAttribution(clave);
	// compruebo si hay que cambiar sólo la URL o si hay que regenerar Mitilelayer
	const gcnew = obtenerConfigMapaBase();
	if (!gcold || gcold.wms == gcnew.wms) {
		// cambio la URL
		Mitilelayer.setUrl(gcnew.url);
		// pongo la nueva atribución
		Mimapa.attributionControl.addAttribution(gcnew.options.attribution);
	}
	else {
		// elimino tileLayer anterior
		Mimapa.removeLayer(Mitilelayer);
		// pongo tileLayer nueva
		Mitilelayer = gcnew.wms? L.tileLayer.wms(gcnew.url, gcnew.options).addTo(Mimapa) 
			: L.tileLayer(gcnew.url, gcnew.options).addTo(Mimapa);
	}
}

function inicioActualizarMapa() {
	// mapa actual
	Sesion.mapaMovido = false;
	// quito timeout anterior (importante llamar tras Sesion.mapaMovido = false)
	finActualizarMapa();
	// pongo bloqueo a actualizaciones
	Sesion.actualizandoMapa = true;
	
	// pinto la barra de progreso
	pintarBarraProgreso(false);
	
	// actualizo la localización del estado de la sesión
	Sesion.estado.loc.lat = Mimapa.getCenter().lat;
	Sesion.estado.loc.lng = Mimapa.getCenter().lng;
	Sesion.estado.loc.z = Mimapa.getZoom();
		
	// reajusto url y actualizo página en la historia si hay cambio en URL
	if (window.location !== obtenerURL())
		history.replaceState(Sesion.estado, "", obtenerURL());
	
	// ajuste propiedad meta de la url
	document.querySelector("meta[property='og:url']").setAttribute('content', window.location.href);	
	//$("meta[property='og:url']").attr('content', window.location.href);
	
	// pongo timeout para que quite el bloqueo tras 10 segundos (por si acaso se bloquea indefinidamente)
	Sesion.idTimeoutActualizar = setTimeout(function(){	
		// mando evento de timeout a GA	
		//sendMapTimeoutEvent();	// TODO!
		
		console.warn("Venció el temporizador de " +  Math.round(Sesion.timeout/1000) + " segundos antes de terminar de actualizar el mapa");
		// logging celdas teselas
		if (Sesion.infoCeldasTeselas.mostrar) {		
			// logging celdas teselas
			let tcc = _.reduce(Sesion.infoCeldasTeselas.cacheadas, function(memo, num){ return memo + num; }, 0);
			let npc = _.reduce(Sesion.infoCeldasTeselas.npc, function(memo, num){ return memo + num; }, 0);
			console.info("#celdasTeselas I" + Sesion.idTimeoutActualizar  + " total: " + Sesion.infoCeldasTeselas.total + " - cacheadas: " 
				+ tcc + " - #npc: " + npc );
		}
		// logging celdas parcelas
		if (Sesion.infoCeldasParcelas.mostrar) {	
			let tcc = _.reduce(Sesion.infoCeldasParcelas.cacheadas, function(memo, num){ return memo + num; }, 0);
			let npc = _.reduce(Sesion.infoCeldasParcelas.npc, function(memo, num){ return memo + num; }, 0);	
			console.info("#celdasParcelas I" + Sesion.idTimeoutActualizar  + " total: " + Sesion.infoCeldasParcelas.total + " - cacheadas: " 
				+ tcc + " - #npc: " + npc );
		}			
		console.groupEnd();
		
		Sesion.actualizandoMapa = false;
		Sesion.idTimeoutActualizar = null;
		// actualizo timeout
		Sesion.timeout += config.timeoutStep;
		Sesion.huboTimeout = true;		
		// y llamo a mapaMovido
		mapaMovido();
	}, Sesion.timeout);
	// logging
	console.group("I" + Sesion.idTimeoutActualizar + " - Actualizando mapa");
	console.time("Actualización I" + Sesion.idTimeoutActualizar);
	console.log("URL: " + window.location);
	console.log("Temporizador actualización: " +  Math.round(Sesion.timeout/1000) + " segundos")
	//console.log(" -> bloqueando actualizaciones y poniendo temporizador antibloqueo: " + Sesion.idTimeoutActualizar);
	
	// inicializo el evento para enviar a Google Analytics
	//initMapEvent();
}

function finActualizarMapa() {
	//console.log(" -> fin de actualización del mapa, quito temporizador antibloqueo");
	Sesion.actualizandoMapa = false; // quito bloqueo
	// cancelo timeout anterior (si existiera)
	if (Sesion.idTimeoutActualizar != null) {
		clearTimeout(Sesion.idTimeoutActualizar);
		console.timeEnd("Actualización I" + Sesion.idTimeoutActualizar);
		console.info("I" + Sesion.idTimeoutActualizar + " - Fin actualización del mapa");
		console.groupEnd();
		Sesion.idTimeoutActualizar = null;
		// activo botón de descarga
		//$(".download").removeClass("disabled");
		// escondo la barra de progreso
		// pintarBarraProgreso(false);
		// actualización timeout
		if (!Sesion.huboTimeout && Sesion.timeout > config.timeout) // si no hubo timeout resto config.timeoutStep (sin superar el valor inicial)
			Sesion.timeout -= config.timeoutStep;
		Sesion.huboTimeout = false; // inicializo para la siguiente
		// mando evento de fin de actualización del mapa
		//sendTimedEvent();	
	}
		
	// llamo a actualizar el mapa si es necesario
	if (Sesion.mapaMovido) {
		console.info("El mapa se había movido, vuelvo a actualizar");
		mapaMovido();
	}/*
	else if (Sesion.ponerAlertaCuestionario) {
		// miro si pongo el cuestionario
		const ahora = Date.now();
		if (ahora - Sesion.inicioSesion > config.intraSessionQGap) {
			// pongo el cuestionario
			$("#mapid").append(alertQuestionnaireTemplate);
			// ya no lo vuelvo a poner en la sesión
			Sesion.ponerAlertaCuestionario = false;
			// y pongo los handlers de los botones
			$("#questbotyes").click(function() {
				// vamos al questionario (nueva pestaña)
				const questurl = $(this).attr("questurl");
				const win = window.open(questurl, '_blank');
				win.focus();
				// no más cuestionarios
				localStorage.setItem('cuestionarioNo', true);
				// quito la alerta
				$("#questalert").alert('close');
			});
			$("#questbotno").click(function() {
				// no más cuestionarios
				localStorage.setItem('cuestionarioNo', true);
				// quito la alerta
				$("#questalert").alert('close');
			});
			$("#questbotlater").click(function() {
				// reajusto a ahora 
				localStorage.setItem('timestampPrimeraSesion', ahora);
				// quito la alerta
				$("#questalert").alert('close');
			});		
		}
	}*/
}


function pintarBarraProgreso(mostrar) {
	// variante sin JQuery para que vaya más rápida la actualización de la barra
	const mibarradiv = document.getElementById('mibarradiv');
	if (mostrar) {
		let total = 0;
		let comp = 0;
		// teselas
		if (Sesion.infoCeldasTeselas.mostrar) {
			total += 100;
			const celdasmed = _.reduce(Sesion.infoCeldasTeselas.mediadas, function(memo, num){ return memo + num; }, 0);
			const celdascomp = _.reduce(Sesion.infoCeldasTeselas.finalizadas, function(memo, num){ return memo + num; }, 0);
			comp += (30*celdasmed + 70*celdascomp)/Sesion.infoCeldasTeselas.total; // de 0 a 100		
		}
		// parcelas
		if (Sesion.infoCeldasParcelas.mostrar) {
			total += 100;	
			const celdasmed = _.reduce(Sesion.infoCeldasParcelas.mediadas, function(memo, num){ return memo + num; }, 0);
			const celdascomp = _.reduce(Sesion.infoCeldasParcelas.finalizadas, function(memo, num){ return memo + num; }, 0);
			comp += (30*celdasmed + 70*celdascomp)/Sesion.infoCeldasParcelas.total; // de 0 a 100		
		}
		// calculo porc (hasta 99)
		const porc = total == 0? 0 : Math.floor( 99 * comp / total );
		// ajusto barra
		let mibarra = document.getElementById('mibarra');
		mibarradiv.setAttribute('aria-valuenow', porc);
		mibarra.style.width = porc + '%';
		mibarra.innerHTML = porc + '%';
		// mensajillo de cargando
		let mibarraLoading = document.getElementById('mibarra_loading');
		const porcLoading = 100 - porc;
		if (porcLoading > 30) {
			mibarraLoading.classList.remove('d-none');
			mibarraLoading.style.width = porcLoading + '%';
		}
		else
			mibarraLoading.classList.add('d-none');		
		// muestro la barra de progreso
		mibarradiv.classList.remove('d-none');		
	} 
	else // escondo la barra
		mibarradiv.classList.add('d-none');	
}
export {Mimapa, initializeMap, mapaMovido, actualizarMapa,actualizarMapaBase}