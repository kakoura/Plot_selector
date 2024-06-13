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

import _ from 'underscore';

import { Sesion, Datos, Layers } from '../main.js';
import { Mimapa } from './map.js';
import { getLiteral, uriToLiteral, firstUppercase, getColor, getColorMix, getPreferredLang } from './util.js';

// TESELAS
function inicializarTeselas() {
	// devuelvo la capa GEOJSON para las teselas
	return L.geoJson(null, {
		style: function(feature) {			
			if (Sesion.estado.mapType === config.mapConfig.mapType[1]) // capa satélite
				return {
					fillColor: config.colores[config.coltesimpind][6], // color de relleno  
					weight: 0.4, // 0.3,
					opacity: 1,
					color: config.colores[config.coltesimpind][1],
					dashArray: '1',
					fillOpacity: 0.05 // 0.1
				};
			else {
				// recupero objeto tesela
				const otes = Datos.teselas[feature.properties.iri];
				return {
					fillColor: colorTesela(otes, false), // color de relleno  
					weight: 0.5,
					opacity: 1,
					color: colorTesela(otes, true), // color de borde
					dashArray: '1',
					fillOpacity: 0.3
				};
			}
		}
	}).addTo(Mimapa);
}
function colorTesela(tesela, esBorde) {
	// capa satélite (por el cambio de color desde taxon)
	if (Sesion.estado.mapType === config.mapConfig.mapType[1]) // capa satélite
		return esBorde? config.colores[config.coltesimpind][1] : config.colores[config.coltesimpind][6];	
	
	// caso por defecto
	// ¿hay uso?
	if (tesela.soilUse == undefined || Datos.usos[config.forestuse] == undefined) {
		if (tesela.soilUse == undefined)
			console.warn("PROBLEMA CON USO DE TESELA "+tesela.iri);
		if (Datos.usos[config.forestuse] == undefined)
			console.warn("PROBLEMA CON LOS DATOS DE USOS DEL DATASET");
		// devuelvo un color, en cualquier caso
		if (esBorde)
			return config.colores[config.colindefind][4];
		else
			return config.colores[config.colindefind][3];
	}
	
	// incluyo los usos de la tesela en un array
	const tesusos = Array.isArray(tesela.soilUse)? tesela.soilUse : [ tesela.soilUse ];

	// 2021-07-19 porcentaje de usos en teselas agregadas del COS
	let infosoilar = null;
	if (tesela.infoSoil)
		infosoilar = Array.isArray(tesela.infoSoil)? tesela.infoSoil : [ tesela.infoSoil ];
	
	// incluyo infospecies en un array si hace falta para el análisis
	let infosar = null;
	if (tesela.infoSpecies)
		infosar = Array.isArray(tesela.infoSpecies)? tesela.infoSpecies : [ tesela.infoSpecies ];
	
	// niveles por defecto
	let nivBorde = 3;
	let nivNormal = 2;
	let nivFiltrado = 7;
	let nivNoFiltrado = 1;
	let nivBordeNoFiltrado = 2;
	
	// valores por defecto
	let ind0 = config.colindefind; // valor por defecto (color gris)
	let ind1 = esBorde? nivBorde : nivNormal; // valor por defecto (intensidad)
	
	// compruebo tipo de uso
	if ( _.intersection(Datos.usos[config.forestuse].expuris, tesusos).length > 0 ) { // uso forestal
		// SELECCIÓN DE COLORES SI HAY FILTRO DE TAXÓN
		if (Sesion.taxones.length > 0) {
			// preparo colores a mezclar
			let cols = [];
			for (let ind = 0; ind < Sesion.taxones.length; ind++) {			
				const tx = Sesion.taxones[ind];
				// calculo porcentaje de cada taxón filtrado para la tesela
				let porc = 0;
				if (infosar != null) { // caso español, analizo especies de la tesela
					for (let i=0; i<infosar.length; i++) {
						const is = infosar[i];
						// si hay coincidencia con la especie filtrada, adentro
						if (_.contains(Datos.taxones[tx].expuris, is.species))
							porc += is.percOccupation;				
					}
				}
				else if (infosoilar != null) { // 2021-05-24 revisión caso portugués, la información de especie puede estar en el uso...
					// tesela agregada con porcentajes de uso
					for (let isoil of infosoilar) {
						if (Datos.usos[isoil.soilUse] && Datos.usos[isoil.soilUse].species) {
							const spa = Array.isArray(Datos.usos[isoil.soilUse].species)? Datos.usos[isoil.soilUse].species : [Datos.usos[isoil.soilUse].species];
							// si hay coincidencia con la especie filtrada, adentro
							if ( _.intersection(Datos.taxones[tx].expuris, spa).length > 0 )
								porc += isoil.percOccupation;
						}
					}			
				}
				else { // caso portugués, no es tesela agregada => utilizo sin más el uso
					for (let tuso of tesusos) {
						if (Datos.usos[tuso] && Datos.usos[tuso].species) {
							const spa = Array.isArray(Datos.usos[tuso].species)? Datos.usos[tuso].species : [ Datos.usos[tuso].species ];
							if ( _.intersection(Datos.taxones[tx].expuris, spa).length > 0 )
								porc = 70; // pongo 70 por defecto (no puedo deducir más)
						}				
					}
				}				
				// si es mayor que 0 obtengo color y guardo
				if (porc > 0) {
					// caso sin filtros y no borde: asigno un 10% de bonus y saturo al 100%
					let caux = getColor(porc + 10, 100, config.colores[Sesion.taxonesColores[ind]]);
					// ¿es borde?					
					if (esBorde) // (caso normal 3)
						caux = config.colores[Sesion.taxonesColores[ind]][nivBorde];
					// meto color a la saca
					cols.push(caux);
				}
			}		
			// si hay algún color...
			if (cols.length > 0)
				return getColorMix(cols);
		}
		// SELECCIÓN DE COLOR SIN FILTRO DE TAXÓN
		ind0 = config.coltesforind; // verde claro (color de teselas de monte)
		// ajuste segundo índice		
		ind1 = 5;
		if (esBorde)
			ind1 = nivBorde;
	}
	else if ( _.intersection(Datos.usos[config.treelessuse].expuris, tesusos).length > 0 ) { // uso sin árboles
		ind0 = config.coltesforind; // verde (color de teselas de monte)
		ind1 = esBorde? nivBorde : 1; // verde muy claro
	}
	else if ( _.intersection(Datos.usos[config.agricuse].expuris, tesusos).length > 0 ) // uso agrícola
		ind0 = config.coltesagrind; // naranja
	else if ( _.intersection(Datos.usos[config.impruse].expuris, tesusos).length > 0 ) // improductivo
		ind0 = config.coltesimpind; // gris
	else if ( _.intersection(Datos.usos[config.wetlanduse].expuris, tesusos).length > 0 ) // humedal-agua
		ind0 = config.colteshumind; // celeste
		
	// devuelvo color
	return config.colores[ind0][ind1];
}
function popupTesela(tesela) {
	// preparo texto del popup para todas las teselas
	let texto = "<strong>"+getLiteral(dict.patch)+' '+uriToLiteral(tesela.iri)+"</strong>";
	// obtengo etiqueta provincia
	if (tesela.province != undefined)
		texto += "<br>" + getLiteral(dict.provinceof) + ' ' + getLiteral(tesela.province);
	// área
	const area = tesela.area;	
	texto += "<br>"+getLiteral(dict.area)+": "+Number((area/10000).toFixed(2)).toLocaleString(getPreferredLang())+"ha";
	
	// uso del suelo
	// 2021-07-19 reajuste uso del suelo
	if (tesela.infoSoil) {
		const infosoilar = Array.isArray(tesela.infoSoil)? tesela.infoSoil : [tesela.infoSoil];
		let filas = [];
		for (let isoil of infosoilar) {
			if (Datos.usos[isoil.soilUse]) {
				let etuso = getLiteral(Datos.usos[isoil.soilUse].label);
				
				// si hay taxones seleccionados y coincide con el uso, reformateo etuso
				if (Sesion.taxones.length > 0) {
					let incs = [];
					for (let tx of Sesion.taxones) {
						if (Datos.usos[isoil.soilUse].species) {
							const spa = Array.isArray(Datos.usos[isoil.soilUse].species)? Datos.usos[isoil.soilUse].species : [Datos.usos[isoil.soilUse].species];
							if ( _.intersection(Datos.taxones[tx].expuris, spa).length > 0 )
								incs.push(tx); // adentro
						}
					}
					// formateo las coincidencias en las listas expandidas de especies
					if (incs.length > 0) {
						etuso += ' ('
						for (let espuri2 of incs) {
							let nesp2 = firstUppercase(getLiteral(Datos.taxones[espuri2].vulgarName, uriToLiteral(espuri2)));
							// si hay nombre científico...
							if (Sesion.nomci) {
								nesp2 = firstUppercase(getLiteral(Datos.taxones[espuri2].scientificName, nesp2));
								// en cursiva
								nesp2 = '<i>' + nesp2 + '</i>';
							}
							// incluyo nombre especie 2
							etuso += '<strong>' + nesp2  + '</strong>, ';
						}
						// reemplazo final...
						etuso += ')';						
						etuso = etuso.replace(", )", ")");
					}
				}
				
				const vinf = 10*Math.floor(isoil.percOccupation/10);
				const vsup = 10*Math.ceil(isoil.percOccupation/10);
				const vtexto = vinf == vsup? vsup + "%" : vinf + "-" + vsup + "%";
				let fila = {
					porc: isoil.percOccupation,
					texto: "<br> - " + etuso + ": " + vtexto,
				}
				// incluyo fila
				filas.push(fila);
			}			
		}
		if (filas.length > 0) {
			texto +=  "<br>" + getLiteral(dict.soiluse) + ":";
			// ordeno filas por porcentaje
			filas = _.sortBy(filas, 'porc').reverse();
			for (let fila of filas)
				texto += fila.texto;
		}
	} else if (tesela.soilUse) { // caso por defecto
		// extraigo primer uso válido
		const uuri = Array.isArray(tesela.soilUse)? tesela.soilUse[0] : tesela.soilUse;
		if (uuri != null && Datos.usos[uuri] != undefined) {// si hay uri, muestro
			let etuso = getLiteral(Datos.usos[uuri].label); // etiqueta por defecto	
			// 2021-07-19 caso usos portugueses con especies
			if (Sesion.taxones.length > 0 && Datos.usos[uuri].species != undefined) {
				let incs = [];
				for (let tx of Sesion.taxones) {
					if (Datos.usos[uuri].species != undefined) {
						const spa = Array.isArray(Datos.usos[uuri].species)? Datos.usos[uuri].species : [Datos.usos[uuri].species];
						if ( _.intersection(Datos.taxones[tx].expuris, spa).length > 0 )
							incs.push(tx); // adentro				
					}
				}
				// formateo las coincidencias en las listas expandidas de especies
				if (incs.length > 0) {
					etuso += ' ('
					for (let espuri2 of incs) {
						let nesp2 = firstUppercase(getLiteral(Datos.taxones[espuri2].vulgarName, uriToLiteral(espuri2)));
						// si hay nombre científico...
						if (Sesion.nomci) {
							nesp2 = firstUppercase(getLiteral(Datos.taxones[espuri2].scientificName, nesp2));
							// en cursiva
							nesp2 = '<i>' + nesp2 + '</i>';
						}
						// incluyo nombre especie 2
						etuso += '<strong>' + nesp2  + '</strong>, ';
					}
					// reemplazo final...
					etuso += ')';						
					etuso = etuso.replace(", )", ")");
				}
			}			
			// incluyo etiqueta
			texto += "<br>"+getLiteral(dict.soiluse)+': ' + etuso;
		}
	}
	
	// cobertura arbórea (teselas de monte)
	if (tesela.canopyCoverTreesPercent != undefined) 
		texto += "<br>"+getLiteral(dict.canopycovertrees)+": "+getLiteral(tesela.canopyCoverTreesPercent)+"%";

	// especies (teselas de monte)
	if (tesela.infoSpecies != undefined) {
		// incluyo infospecies en un array si hace falta para el análisis
		const infosar = Array.isArray(tesela.infoSpecies)? tesela.infoSpecies : [tesela.infoSpecies];	
		let filas = [];
		for (let i=0; i<infosar.length; i++) {
			// cojo elemento infoSpecies
			const is = infosar[i];			
			if (Datos.taxones[is.species] != undefined) {							
				let nesp = firstUppercase(getLiteral(Datos.taxones[is.species].vulgarName, uriToLiteral(is.species)));
				// si hay nombre científico...
				if (Sesion.nomci) {
					nesp = firstUppercase(getLiteral(Datos.taxones[is.species].scientificName, nesp));
					// en cursiva
					nesp = '<i>' + nesp + '</i>';
				}
				// si hay taxones seleccionados, ajusto formateo si procede
				if (Sesion.taxones.length > 0) {
					let incs = [];
					for (let tx of Sesion.taxones) {
						if (is.species === tx) // coincidencia!
							nesp = '<strong>' + nesp + '</strong>';
						else if (_.contains(Datos.taxones[tx].expuris, is.species)) {
							// coincidencia en la lista expandida de especies
							incs.push(tx);						
						}
					}
					// formateo las coincidencias en las listas expandidas de especies
					if (incs.length > 0) {
						nesp += ' ('
						for (let espuri2 of incs) {
							let nesp2 = firstUppercase(getLiteral(Datos.taxones[espuri2].vulgarName, uriToLiteral(espuri2)));
							// si hay nombre científico...
							if (Sesion.nomci) {
								nesp2 = firstUppercase(getLiteral(Datos.taxones[espuri2].scientificName, nesp2));
								// en cursiva
								nesp2 = '<i>' + nesp2 + '</i>';
							}
							// incluyo nombre especie 2
							nesp += '<strong>' + nesp2  + '</strong>, ';
						}
						// reemplazo final...
						nesp += ')';						
						nesp = nesp.replace(", )", ")");
					}
				}				
				// preparo fila				
				const vinf = 10*Math.floor(is.percOccupation/10);
				const vsup = 10*Math.ceil(is.percOccupation/10);
				const vtexto = vinf == vsup? vsup + "%" : vinf + "-" + vsup + "%";
				let fila = {
					porc: is.percOccupation,
					texto: "<br> - " + nesp + ": " + vtexto,
				}
				// incluyo fila
				filas.push(fila);
			}			
		}
		if (filas.length > 0) {
			texto +=  "<br>" + getLiteral(dict.speciesinfo) + ":";
			// ordeno filas por porcentaje
			filas = _.sortBy(filas, 'porc').reverse();
			for (let fila of filas)
				texto += fila.texto;
		}
	}
	return texto;
}


function pintarTeselas(turis) {
	// preparo teselas a pintar en GeoJSON
	let teselas = []; // teselas a pintar
	let pturis = []; // uris de las teselas a pintar
	for (let turi of turis) {
		// si está pintada no sigo
		if (!Sesion.tesPintadas[turi]) {
			// marco como pintada, pero no guardo aún la capa de Leaflet
			Sesion.tesPintadas[turi] = true;
			const otes = Datos.teselas[turi];
			// sólo sigo si hay geometría
			if (otes.geometry) {
				// inicializo objeto
				let patch = {
					"type": "Feature",
					"properties" : {}		
				};
				// iri
				patch.properties.iri = turi;
				/* TODO: creo que sobra
				// área
				if (otes.area)
					patch.properties.Shape_Area = otes.area;*/
				// geometría
				patch.geometry = otes.geometry;
				// guardo en las listas
				teselas.push(patch);
				pturis.push(turi);
			}		
		}
	}
	
	// pinto las teselas
	Layers.tess.addData(teselas);
	
	// guardo los layers (habrá sobreescrituras, pero esto es rápido)
	for (let layer of Layers.tess.getLayers()) {
		const iri = layer.feature.properties.iri;
		Sesion.tesPintadas[iri] = layer;
	}
	
	// actualizo popups a pturis
	ajustarPopupsTeselas(pturis, true);
	
	// mando la capa de teselas al fondo
	Layers.tess.bringToBack();
}

function ajustarColorTeselas(turis, todas) { // todas o sólo monte
	// ajusto color tesela a tesela
	for (let turi of turis) {
		if (Sesion.tesPintadas[turi] && typeof Sesion.tesPintadas[turi] === 'object' && Datos.teselas[turi].soilUse && Datos.usos[config.forestuse]) {
			const tesusos = Array.isArray(Datos.teselas[turi].soilUse)? Datos.teselas[turi].soilUse : [ Datos.teselas[turi].soilUse ];	
			if (todas || _.intersection(Datos.usos[config.forestuse].expuris, tesusos).length > 0) {
				// obtengo colores y ajusto estilo
				const colint = colorTesela(Datos.teselas[turi], false);
				const colext = colorTesela(Datos.teselas[turi], true);
				Sesion.tesPintadas[turi].setStyle( {fillColor: colint, color: colext} );			
			}
		}
	}
}

function ajustarPopupsTeselas(turis, todas) {
	// ajusto popup tesela a tesela (si son de monte, las del resto no cambian)
	for (let turi of turis) {
		if (Sesion.tesPintadas[turi] && typeof Sesion.tesPintadas[turi] === 'object' && Datos.teselas[turi].soilUse && Datos.usos[config.forestuse]) {
			const tesusos = Array.isArray(Datos.teselas[turi].soilUse)? Datos.teselas[turi].soilUse : [ Datos.teselas[turi].soilUse ];	
			if (todas || _.intersection(Datos.usos[config.forestuse].expuris, tesusos).length > 0) {
				// pongo popup hago realce
				const texto = popupTesela(Datos.teselas[turi]);
				Sesion.tesPintadas[turi].bindPopup(texto)
					.on({
						popupopen: function(e) { // realce
							let layer = e.target;
							if (Sesion.estado.mapType === config.mapConfig.mapType[1]) // capa satélite
								layer.setStyle({
									fillOpacity: 0.3, //0.2,
									weight: 1.2 //0.9
								});
							else
								layer.setStyle({
									fillOpacity: 0.4,
									weight: 1.5
								});
						},
						popupclose: function(e) { // quitar realce
							let layer = e.target;
							if (Sesion.estado.mapType === config.mapConfig.mapType[1]) // capa satélite
								layer.setStyle({
									fillOpacity: 0.05, //0.1,
									weight: 0.4 //0.3
								});							
							else
								layer.setStyle({
									fillOpacity: 0.3,
									weight: 0.5
								});
						}
					});
			}
		}
	}
}

function quitarTeselas() {
	console.info("Borrando capa de teselas...");
	//console.time("Limpieza de teselas");
	// es algo más rápido eliminar la capa del mapa y cargar una nueva
	Layers.tess.remove(); 
	Layers.tess = inicializarTeselas();
	Layers.tess.bringToBack();
	// inicializo la lista de teselas pintadas
	Sesion.tesPintadas = {};
	//console.timeEnd("Limpieza de teselas");	
	/*
	const pturis = Object.keys(Sesion.tesPintadas);
	console.info("Borrando "+ pturis.length +" teselas...");
	// borro la capa de teselas
	Tess.clearLayers();
	// inicializo la lista de teselas pintadas
	Sesion.tesPintadas = {};*/
}

export { inicializarTeselas, pintarTeselas, ajustarColorTeselas, ajustarPopupsTeselas, quitarTeselas };