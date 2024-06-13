/*
   Copyright 2023, Guillermo Vega-Gorgojo

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

import config from '../data/config.json';
import dict from '../data/dictionary.json';

import $ from "jquery";
import Mustache from 'mustache';

import { Solr, Sesion } from '../main.js';
import { Mimapa } from './map.js';
import { sugeLugaresTemplate } from '../data/htmlTemplates.js';
import { getIconoLugar } from './icons.js';
import { getLiteral } from './util.js';

/////////////////////
// RENDER DEL CAJETÍN
function renderEntradaLugares(mostrar) {
	console.log(Solr);
	if (mostrar && Solr != null)
		$('#lugares_heading').removeClass("d-none");
	else
		$('#lugares_heading').addClass("d-none");
}

///////////////////////////
// OBTENCIÓN DE SUGERENCIAS
async function obtenerSugerenciasLugares(entrada) {
	try {
		// hago la llamada a solr y espero resultados
		const datos = await Solr.getSuggestions(entrada);
		// extraigo sugerencias
		let keys = Object.keys(datos.suggest.mySuggester);
		if (keys.length > 0) 
			return datos.suggest.mySuggester[keys[0]];
		else // si no hay resultados, mando un objeto nuevo
			return {'numFound': 0};
	} catch(err) {
		reject(err);
	}
}

/////////////////////
// RENDER SUGERENCIAS
function renderSugerenciasLugares(resultados) {
	// objeto sugerencias
	let sinfo = {};
	sinfo.sugerencias = [];
	
	// formateo las sugerencias
	if (resultados.numFound == 0)
		sinfo.nosugerencias = true;
	else {
		for (let ind =0; ind < resultados.suggestions.length; ind++) {
			sinfo.sugerencias.push(
				{
					'id': resultados.suggestions[ind].payload, // el id
					'name': resultados.suggestions[ind].term // la sugerencia
				}
			);
		}
	}
	
	// muestro sugerencias
	let cont = Mustache.render(sugeLugaresTemplate, sinfo);
	$("#sugelugares").html(cont);
		
	// handler de los botones de sugerencias de lugares
	$(".bot_suge_lugar").click(async function() {
		// obtengo id de la sugerencia
		const id = $(this).attr("id");		
		// pedimos la información del lugar
		const datos = await Solr.getDocument(id);
		// si hay algo, vamos al primero
		if (datos.response.numFound > 0) 
			seleccionarLugar(datos.response.docs[0]);
	});
	
	// inicializo focus
	Sesion.lugarfocus = -1;
}

///////////////
// AJUSTE FOCUS
function ajustarLugarfocus() {
	// Sesion.lugarfocus = 0; => cajetín entrada
	// Sesion.lugarfocus = i; => num de sugerencia
	// obtengo número de sugerencias
	const ns = $("#sugelugares").children(":enabled").length;
	// reajusto índice del focus si hace falta
	if (ns == 0) Sesion.lugarfocus = -1;
	else if (Sesion.lugarfocus >= ns) Sesion.lugarfocus = 0;
	else if (Sesion.lugarfocus < 0) Sesion.lugarfocus = ns -1;
	// y ahora las cosas visuales
	$("#sugelugares").children().removeClass("active");
	if (Sesion.lugarfocus >= 0)
		$("#sugelugares").children().eq(Sesion.lugarfocus).addClass("active");
}

////////////////////
// SELECCIONAR LUGAR
function seleccionarLugar(lugar) {
	// pongo nombre	en la entrada
	$("#in_lugares").val(lugar.name);
	
	// escondo la lista de sugerencias
	$("#sugelugares").addClass("d-none");
	
	// inicializo focus
	Sesion.lugarfocus = -1;
	
	// si había marcador de lugar, lo quito
	if (Sesion.lugarmarker != null)
		Sesion.lugarmarker.remove();
		
	// pongo tooltip y marcador en el lugar
	let tooltip = '<strong>'+lugar.name+'</strong>';
	// pongo el tipo de lugar
	tooltip += '<br>' + getLiteral(dict[lugar.feature_code]);
	// población
	if (lugar.population > 0)
		tooltip += '<br>'+getLiteral(dict.population)+': '+Number(lugar.population).toLocaleString();
	// coordenadas
	const coords = [lugar.latitude, lugar.longitude];
	// pongo marcador
	// Sesion.lugarmarker = L.marker(coords, {icon: getIconoLugar()})
	// 	.bindTooltip(tooltip)
	// 	.addTo(Mimapa);
	Sesion.lugarmarker = L.marker(coords)
		.bindTooltip(tooltip)
		.addTo(Mimapa);
		
	// guardo lugar en la sesión (para poder hacer un zoom si se pulsa intro en la entrada)
	Sesion.lugar = lugar;
	
	// mando evento de selección de lugar a GA
	// TODO!!
	//sendEvent( 'select_content', { content_type: 'place_selection', content_id: lugar[lab]} );
	
	// navegamos al municipio
	Mimapa.flyTo(coords, config.zLugar, {animate: true, duration: 1});
}

export { renderEntradaLugares, obtenerSugerenciasLugares, renderSugerenciasLugares, ajustarLugarfocus };