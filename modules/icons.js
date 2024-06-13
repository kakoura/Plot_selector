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

import L from 'leaflet';
import _ from 'underscore';

import { Sesion, Datos } from '../main.js';
import { getMoreSpecificTaxon } from './taxons.js';

// ICONOS
let iconos = {};
function generaIconos() {
	// genero icono genérico de arbol
	iconos.arbol = {};
	iconos.arbol.nor = generaIconoArbol( config.treeicon );
	iconos.arbol.des = generaIconoArbol( config.treeicon + '_des' );
	for (const cind of config.coltxinds)
		iconos.arbol[cind] = generaIconoArbol( config.treeicon + cind );
	// genero iconos por familia
	for (const furi in config.familyicons) {
		// inicializo objeto
		iconos[furi] = {};
		// iconos normal y deshabilitado
		iconos[furi].nor = generaIconoArbol( config.familyicons[furi] );
		iconos[furi].des = generaIconoArbol( config.familyicons[furi] + '_des' );
		// iconos de colores
		for (const cind of config.coltxinds) 
			iconos[furi][cind] = generaIconoArbol( config.familyicons[furi] + cind );
	}
	// genero icono de lugar
	// a partir de https://github.com/pointhi/leaflet-color-markers
	iconos.lugar = new L.Icon({
		iconUrl: new URL('../images/marker-icon-2x-blue.png', import.meta.url),
		shadowUrl: new URL('../images/marker-shadow.png', import.meta.url),
		iconSize: [25, 41],
		iconAnchor: [12, 41],
		popupAnchor: [1, -34],
		shadowSize: [41, 41]
	});
	// inicializo iconos de taxones
	iconos.taxones = {};
}

function getIconoLugar() {
	return iconos.lugar;
}

function generaIconoArbol(nfich) {
	// tengo que generar de forma muy rara la URL de la imagen por culpa de Parcel: https://github.com/parcel-bundler/parcel/issues/3056
	let urlarb = new URL('../images/frondosa.png', import.meta.url); // url estática
	urlarb.pathname = nfich + '.png'; // y cambio aquí el pathname
	return new L.Icon({
		iconUrl: urlarb,
		iconSize:     [80, 80], // size of the icon
		iconAnchor:   [40, 76], // point of the icon which will correspond to marker's location
		tooltipAnchor:[15, -35], // point from which tooltips will "open", relative to the icon anchor
		popupAnchor: [1, -55]
	});
}

function getIconoArbol(arb) {
	// lo primero es ver qué tipo de icono toca
	let icono = iconos.arbol; // valor por defecto
	const txuri = getMoreSpecificTaxon(arb.species);
	if (txuri) {
		// si no está definido el icono de la especie, lo calculo
		if (!iconos.taxones[txuri]) {
			let icaux = iconos.arbol; // valor por defecto
			// analizamos las familias
			for (const furi in config.familyicons) {
				// compruebo si está incluido txuri en la lista de uris expandida de la familia
				if ( _.contains(Datos.taxones[furi].expuris, txuri) )
					icaux = iconos[furi]; // ¡es de la familia!
			}
			// guardo para luego
			iconos.taxones[txuri] = icaux;
		}
		// asigno el icono
		icono = iconos.taxones[txuri];	
	}
	
	// y luego vemos si está seleccionado a partir del taxón	
	// si no hay selección, icono normal o no hay tipo del árbol (¡caso raro!)
	if (Sesion.taxones.length == 0)
		return icono.nor; // devuelvo icono normal
		
	// HAY UNO O MÁS TAXONES SELECCIONAOAS
	// si no hay especie del árbol (¡caso raro!), icono deshabilitado
	if (!txuri)
		return icono.des;
	// sí hay especie
	let cindsel = null;
	let numexpurissel = null;
	// analizo cada taxón filtrado
	for (let ind=0; ind<Sesion.taxones.length; ind++) {
		const tx = Sesion.taxones[ind];
		// si alguna especie de árbol coincide...
		if ( _.contains(Datos.taxones[tx].expuris, txuri) ) {
			// incluyo sólo si numexpurissel es null o si el número de expuris es menor que numexpurissel
			if (numexpurissel == null || Datos.taxones[tx].expuris.length < numexpurissel) {
				// guardo color y número de expuris
				cindsel = Sesion.taxonesColores[ind];
				numexpurissel = Datos.taxones[tx].expuris.length;
			}		
		}
	}
	// si hay selección la devuelvo
	if (cindsel != null)
		return icono[cindsel];
	else // en otro caso, icono deshabilitado
		return icono.des;
}

export { generaIconos, getIconoLugar, getIconoArbol };