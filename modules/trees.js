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

import L from 'leaflet';

import { Sesion, Datos, Layers } from '../main.js';
import { getMoreSpecificTaxon } from './taxons.js';
import { popupParcela } from './plots.js';
import { getIconoArbol } from './icons.js';
import { getLiteral, uriToLiteral, firstUppercase } from './util.js';


function ajustarColorArboles(puris) {
	for (let puri of puris) {
		if (Sesion.parcarbPintadas[puri]) {
			// ajusto iconos de los árboles de la parcela
			for (let arburi of Datos.parcelas[puri].arbs) {
				const aicon = getIconoArbol(Datos.arboles[arburi]);
				if (Sesion.arbPintados[arburi].getIcon() != aicon)
					Sesion.arbPintados[arburi].setIcon(aicon);
			}
		}
	}
}

function ajustarPopupsArboles(puris) {
	for (let puri of puris) {
		if (Sesion.parcarbPintadas[puri]) {
			// ajusto popups de los círculos
			const texto = popupParcela(Datos.parcelas[puri]);
			for (let circ of Sesion.parcarbPintadas[puri])
				circ.bindPopup(texto);
			// ajusto popups de los árboles de la parcela
			for (let arburi of Datos.parcelas[puri].arbs) 
				Sesion.arbPintados[arburi].bindPopup(popupArbol(Datos.arboles[arburi]));
		}
	}
}

// ÁRBOLES
function pintarArboles(puris) {
	// obtenemos las parcelas a pintar
	let parcpintar = [];
	for (let puri of puris) {
		// sólo pintamos si no estaba la parcela en la capa
		if (!Sesion.parcarbPintadas[puri]) {
			// guardo la parcela en la lista
			parcpintar.push(Datos.parcelas[puri]);
			// y añado también a la lista de parcelas pintadas
			Sesion.parcarbPintadas[puri] = []; // array para guardar los círculos de las parcelas
		}
		/* TODO
		else { 
			// estaba pintada la parcela, reajusto popups de los círculos
			let texto = tooltipParcela(Datinv.parcelas[ploturi], true);
			_.each(Sesion.parcarbPintadas[ploturi], function(circ) {
				circ.bindPopup(texto);
			});			
			// hago reajuste de iconos de los árboles si es necesario
			_.each(Datinv.parcelas[ploturi].arbs, function(arburi) {
				// recupero el árbol
				const arb = Datinv.arboles[arburi];
				// obtengo su icono
				const ticon = getIconoArbol(arb);
				// cambio el icono si no coincide
				if (Sesion.arbPintados[arburi].getIcon() != ticon)
					Sesion.arbPintados[arburi].setIcon(ticon);
			});
		}*/		
	}
	//console.log("# DE PARCELAS POR PINTAR: "+plots.length);
	// logging del rendering
	//console.log("Rendering de parcelas de árboles: " + _.keys(Sesion.parcarbPintadas).length + " pintadas - " + plots.length +" pendientes");

	// pinto los 4 círculos de las parcelas: 5, 10, 15, 25m
	const imax = config.colores[config.colcircplotind].length - 1;
	for (let plot of parcpintar) {	
		// obtengo texto del popup de la parcela		
		const texto = popupParcela(plot);
		// creo los 4 círculos y les incluyo un popup con el texto anterior
		Sesion.parcarbPintadas[plot.iri].push( L.circle([plot.lat, plot.lng], 
				{color: config.colores[config.colcircplotind][imax-6], weight: 1, radius: config.radioParcelaN3, fillOpacity: 0.7})
			.bindPopup(texto)
			.addTo(Layers.arbs) );
		Sesion.parcarbPintadas[plot.iri].push( L.circle([plot.lat, plot.lng], 
				{color: config.colores[config.colcircplotind][imax-4], weight: 1, radius: config.radioParcelaN2, fillOpacity: 0.3})
			.bindPopup(texto)
			.addTo(Layers.arbs) );
		Sesion.parcarbPintadas[plot.iri].push( L.circle([plot.lat, plot.lng], 
				{color: config.colores[config.colcircplotind][imax-2], weight: 1, radius: config.radioParcelaN1, fillOpacity: 0.3})
			.bindPopup(texto)
			.addTo(Layers.arbs) );
		Sesion.parcarbPintadas[plot.iri].push( L.circle([plot.lat, plot.lng], 
				{color: config.colores[config.colcircplotind][imax], weight: 1, radius: config.radioParcelaN0, fillOpacity: 0.3})
			.bindPopup(texto)
			.addTo(Layers.arbs) );

		// recorro los árboles de la parcela
		for (let arburi of plot.arbs) {
			// recupero el árbol
			const arb = Datos.arboles[arburi];
			// obtengo su icono
			const ticon = getIconoArbol(arb);
			// pinto y guardo el marcador del árbol
			Sesion.arbPintados[arburi] = L.marker([arb.lat, arb.lng], {icon: ticon})
				.bindPopup(popupArbol(arb))
				.addTo(Layers.arbs);
		}
	}
}
function popupArbol(arb) {
	let popup = "<strong>"+getLiteral(dict.tree)+" " + uriToLiteral(arb.iri) + "</strong>";
	const txuri = getMoreSpecificTaxon(arb.species);
	// especie
	if (txuri && Datos.taxones[txuri].vulgarName) {		
		let nesp = firstUppercase(getLiteral(Datos.taxones[txuri].vulgarName, uriToLiteral(txuri)));
		// si hay nombre científico...
		if (Sesion.nomci) {
			nesp = '<i>' + firstUppercase(getLiteral(Datos.taxones[txuri].scientificName,
				nesp)) + '</i>';
		}
		popup += '<br>' + nesp;
	}
	// altura
	if (arb.heightM != undefined)
		popup += "<br>"+getLiteral(dict.height)+": " + Number(getLiteral(arb.heightM)).toFixed(2) + "m";
		//tooltip += "<br>"+getLiteral(dict.height)+": "+getLiteral(arb.heightM)+"m";
	// diámetro
	if (arb.dbh1mm && arb.dbh2mm) {
		const dbh1 = getLiteral(arb.dbh1mm);
		const dbh2 = getLiteral(arb.dbh2mm);
		if (dbh1 && dbh2) {
			// calculo media aritmética
			const dbh = (dbh1 + dbh2)/2;			
			popup += '<br>'+getLiteral(dict.diameter)+': '+dbh+'mm';
		}
	}
	return popup;
}
function quitarArboles() {
	console.info("Borrando capa de árboles...");
	// borro la capa de árboles
	Layers.arbs.clearLayers();
	// inicializo la lista de parcelas pintadas en modo árbol
	Sesion.parcarbPintadas = {};
	// inicializo la lista de árboles pintados
	Sesion.arbPintados = {};	
}

export { pintarArboles, ajustarColorArboles, ajustarPopupsArboles, quitarArboles };