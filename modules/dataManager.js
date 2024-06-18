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

// EN ESTE FICHERO METO TODAS LAS FUNCIONES RELACIONADAS CON LA OBTENCIÓN DE DATOS DEL TRIPLE STORE
	
import config from '../data/config.json';

import _ from 'underscore';
import { point, booleanPointInPolygon, booleanIntersects } from '@turf/turf';
import "@turf/turf";
import { parse } from 'wkt';

import { Sesion, Datos, Crafts, CachedQueries } from '../main.js';
import { getAllSubclasses } from './util.js';
import { getCeldaBounds, getCeldaGridMatrix } from './grid.js';


/////////
// UTILES
function descomponerCraftsResources(id, uris) {
	// array a devolver con la descomposición
	let devolver = [];
	// array de huérfanos (para combinar)
	let huerfanos = [];

	// organizo las uris por sus namespaces
	let nsuris = {};
	// analizo cada uri y la meto por su namespace
	for (let i=0; i<uris.length; i++) {
		const uri = uris[i];
		// obtengo namespace
		const indfin = Math.max( uri.lastIndexOf('/'), uri.lastIndexOf('#') );
		const ns = uri.substring(0, indfin + 1);
		// guardo
		if (nsuris[ns] == undefined)
			nsuris[ns] = [];
		nsuris[ns].push(uri);
	}
	
	// analizo cada namespace encontrado
	const nss = Object.keys(nsuris);
	for (let i=0; i<nss.length; i++) {
		// obtengo el namespace y sus uris
		const mins = nss[i];
		const misuris = nsuris[mins];
		// preparo lotes de 200
		const lote = 200;
		for (let ind=0; misuris.length > ind*lote; ind++) {
			const begin = ind*lote;
			const end = misuris.length > (ind + 1)*lote? (ind + 1)*lote : misuris.length;
			// si este lote es inferior a 10, los meto en huérfanos
			if (end - begin < 10) 
				huerfanos = huerfanos.concat( misuris.slice( begin, end ) );
			else {
				// creo un objeto para este lote
				let obj = {};
				obj.id = id;
				obj.ns = mins;
				obj.nspref = 'p'; // arbitrario
				obj.iris = [];
				// meto cada iri con prefijo en el lote
				for (let j=begin; j<end; j++) {
					const uri = misuris[j];
					const prefuri = 'p:' + uri.substring(mins.length);
					obj.iris.push(prefuri);				
				}
				// y guardo el objeto en devolver
				devolver.push(obj);
			}
		}
	}
	
	// proceso los huérfanos en lotes de 40
	const lote = 40;
	for (let ind=0; huerfanos.length > ind*lote; ind++) {
		const begin = ind*lote;
		const end = huerfanos.length > (ind + 1)*lote? (ind + 1)*lote : huerfanos.length;
		// creo un objeto para este lote
		let obj = {};
		obj.id = id;
		obj.iris = huerfanos.slice( begin, end );
		// y guardo el objeto en devolver
		devolver.push(obj);
	}
		
	// devuelvo la descomposición
	return devolver;
}
// util para usos y taxones
function initClass(objbase, cluri) {
	if (objbase[cluri] == undefined) {
		objbase[cluri] = {
			"uri": cluri, 
			"subclasses": [], 
			"superclasses": []
		};
	}
}

//////////////////////////////////////
// INICIALIZACIONES PROVEEDOR DE DATOS
// obtengo todos los usos para las teselas
async function getUsesInfo() {
	// preparo obje	to para la petición a CRAFTS de pares de superclase-subclase a partir de config.usoTop
	const qobj = { 'ancestor': config.usoTop };
	
	const datos = await Crafts.getData(config.craftsConfig.querySubclasses, qobj);
	// fue todo bien, inicializo clase config.usoTop
	// console.log(Datos.usos);
	initClass(Datos.usos, config.usoTop);	
	// analizo cada fila de los resultados
	for (let row of datos.results.bindings) {
		// obtengo datos
		const supuri = row.sup.value;
		const suburi = row.sub.value;
		// inicializo clases
		initClass(Datos.usos, supuri);
		initClass(Datos.usos, suburi);
		// guardo subclase
		Datos.usos[supuri].subclasses.push(suburi);
		// guardo superclase
		Datos.usos[suburi].superclasses.push(supuri);
	}
	
	// obtengo usos expandidos
	let evuuris = Object.keys(Datos.usos);
	while(evuuris.length > 0) {
		let newevuuris = [];
		for (let uuri of evuuris) {
			// recupero uso
			const uso = Datos.usos[uuri];
			// obtengo la uri de cualquier subuso sin expandir
			const algsubuuri = _.find(uso.subclasses, function(subuuri) {
				return Datos.usos[subuuri].expuris == undefined;					
			});
			// si no está definida, puedo hacer la expansión de uris
			if (algsubuuri == undefined) {
				// inicializo con la uri del propio uso
				uso.expuris = [uuri];
				// y ahora incluimos las de la subclases
				for (let subuuri of uso.subclasses)
					uso.expuris = _.union(uso.expuris, Datos.usos[subuuri].expuris);
			}
			else // hay que esperar a la siguiente iteración
				newevuuris.push(uuri);
		}
		// actualizo lista de tipos a evaluar
		evuuris = newevuuris;
	}
	
	// ahora pido a CRAFTS la info de cada uso
	let promesas = []; // initialize promises array
	const uuris = Object.keys(Datos.usos); // get the uses
	// console.log("Uses URIs:", uuris); // log the URIs of the uses

	// prepare objects for the CRAFTS resources call
	const objrs = descomponerCraftsResources('Use', uuris);
	// console.log("Crafts resource objects:", objrs); // log the objects prepared for CRAFTS resources call

	// initiate parallel requests to CRAFTS for each object
	for (let i = 0; i < objrs.length; i++) {
		// create a promise for each request
		promesas.push(new Promise(async function(resolve, reject) {
			try {
				// make the call to CRAFTS and wait for results
				let datos = await Crafts.getData(config.craftsConfig.resourcesTemplate, objrs[i]);
				// console.log("Received data from CRAFTS:", datos); // log the data received from CRAFTS

				// convert to array if necessary
				if (!Array.isArray(datos))
					datos = [datos];

				// update each use
				for (let dato of datos) {
					let uso = Datos.usos[dato.iri];
					if (dato.label != undefined)
						uso.label = dato.label;
					if (dato.species != undefined)
						uso.species = dato.species;
				}
				// resolve the promise
				resolve(true);
			} catch (err) {
				reject(err);
			}
		}));
	}

	// wait for all promises to resolve
	await Promise.all(promesas);
}

// info de todos los taxones
async function getTaxonsInfo() {
	// obtengo info de subclases de los taxones
	for (let i=0; i<config.taxonesTop.length; i++) {	
		// preparo objeto para la petición a CRAFTS de pares de superclase-subclase a partir de config.taxonesTop
		const qobj = { 'ancestor': config.taxonesTop[i] };
        // console.log("Query Object:", qobj); // New console log
        const datos = await Crafts.getData(config.craftsConfig.querySubclasses, qobj);
        // console.log("Data for taxon:", config.taxonesTop[i], datos); // New console log
        
		// fue todo bien, inicializo clase config.taxonesTop[i]		
		initClass(Datos.taxones, config.taxonesTop[i]);	
		// analizo cada fila de los resultados
		for (let row of datos.results.bindings) {
			// obtengo datos
			const supuri = row.sup.value;
			const suburi = row.sub.value;
			// inicializo clases
			initClass(Datos.taxones, supuri);
			initClass(Datos.taxones, suburi);
			// guardo subclase
			Datos.taxones[supuri].subclasses.push(suburi);
			// guardo superclase
			Datos.taxones[suburi].superclasses.push(supuri);
		}
	}
	// obtengo taxones expandidos
	let evsuris = Object.keys(Datos.taxones);
	while(evsuris.length > 0) {
		let newevsuris = [];
		for (let suri of evsuris) {
			// recupero taxon
			const taxon = Datos.taxones[suri];
			// ajusto nivel (para determinar si es especie/género/familia/clase)
			if (taxon.nivel == undefined)
				taxon.nivel = 0;
			else
				taxon.nivel++;
			// obtengo la uri de cualquier subespecie sin expandir
			const algsubsuri = _.find(taxon.subclasses, function(subsuri) {
				return Datos.taxones[subsuri].expuris == undefined;					
			});
			// si no está definida, puedo hacer la expansión de uris
			if (algsubsuri == undefined) {
				// inicializo con la uri de la propia taxon
				taxon.expuris = [suri];
				// y ahora incluimos las de la subclases
				for (let subsuri of taxon.subclasses)
					taxon.expuris = _.union(taxon.expuris, Datos.taxones[subsuri].expuris);
			}
			else // hay que esperar a la siguiente iteración
				newevsuris.push(suri);
		}
		// actualizo lista de tipos a evaluar
		evsuris = newevsuris;
	}
	// console.log("Expanded taxons:", Datos.taxones); // New console log
	// obtengo taxones expandidas superiores
	evsuris = Object.keys(Datos.taxones);
	while(evsuris.length > 0) {
		let newevsuris = [];
		for (let suri of evsuris) {
			// recupero taxon
			const taxon = Datos.taxones[suri];
			// obtengo la uri de cualquier supertaxon sin expandir
			const algsupersuri = _.find(taxon.superclasses, function(supersuri) {
				return Datos.taxones[supersuri].superexpuris == undefined;					
			});
			// si no está definida, puedo hacer la expansión de uris
			if (algsupersuri == undefined) {
				// inicializo con la uri de la propia taxon
				taxon.superexpuris = [suri];
				// y ahora incluimos las de la superclases
				for (let supersuri of taxon.superclasses)
					taxon.superexpuris = _.union(taxon.superexpuris, Datos.taxones[supersuri].superexpuris);
			}
			else // hay que esperar a la siguiente iteración
				newevsuris.push(suri);
		}			
		// actualizo lista de tipos a evaluar
		evsuris = newevsuris;
	}
	// console.log("Expanded superior taxons:", Datos.taxones);
	
	// obtengo el número de individuos directos de cada especie (de CachedQueries.countTreesPerTaxon)
	const suris = Object.keys(Datos.taxones); 
	// inicializo a 0 el número de individuos
	for (let i=0; i<suris.length; i++)
		Datos.taxones[ suris[i] ].indivs = { 'count': 0 };
	
	// extraigo los datos de CachedQueries.countTreesPerTaxon
	for (let row of CachedQueries.countTreesPerTaxon.results.bindings) {
		// obtengo datos
		const cluri = row.tx.value;
		const count = Number(row.ntrees.value);
		// guardo sólo si existe
		if (Datos.taxones[cluri] != undefined && Datos.taxones[cluri].indivs != undefined)
			Datos.taxones[cluri].indivs.count = count;
	}
	// calculo suma de todos los individuos (incluyo los de las subclases)
	for (let suri of suris) {
		let nindivs = Datos.taxones[suri].indivs.count; // los directos
		// sumo los individuos de las subclases
		const suburis = getAllSubclasses(suri, Datos.taxones);
		for (let j=0; j<suburis.length; j++)
			nindivs += Datos.taxones[suburis[j]].indivs.count;
		// guardo la suma de todos
		Datos.taxones[suri].indivs.countALL = nindivs;
	}
	// borro los datos cacheados
	delete CachedQueries.countTreesPerTaxon;
	// console.log("Taxons with individual count:", Datos.taxones); // New console log
	
	// ahora pido a CRAFTS la info de cada taxon
	let promesas = []; // inicializo promesas
	// pido descomponer en objetos para la llamada resources de CRAFTS	
	const objrs = descomponerCraftsResources('Species', suris);
	// ya tengo los objetos a pedir, lanzo las peticiones en paralelo a CRAFTS
	for (const objr of objrs) {
		// creo una promesa para cada petición
		promesas.push( new Promise(async function(resolve, reject) {
			try {
				// hago la llamada a CRAFTS	y espero resultados
				let datos = await Crafts.getData(config.craftsConfig.resourcesTemplate, objr);
				// convierto en array si es necesario
				if (!Array.isArray(datos))
					datos = [ datos ];			
				// actualizo taxon a taxon
				for (let dato of datos)
					Object.assign(Datos.taxones[dato.iri], dato);
				/* TODO previo
				for (let dato of datos) {
					let esp = Datos.taxones[dato.iri];
					if (dato.scientificName != undefined)
						esp.scientificName = dato.scientificName;
					if (dato.vulgarName != undefined)
						esp.vulgarName = dato.vulgarName;
					if (dato.dbpedia != undefined)
						esp.dbpedia = dato.dbpedia;
					if (dato.wikipediaPage != undefined)
						esp.wikipediaPage = dato.wikipediaPage;
				}*/
				// resuelvo la promesa
				resolve(true);
			} catch(err) {
				reject(err);
			}
		}) );
	}
	
	// espero a que terminen todas las promesas
	await Promise.all(promesas);
}


function taxonsChange(){

	// console.log(Datos.taxones);
	for (const [key, value] of Object.entries(Datos.taxones)) {
		// Check if the current key represents a genus
		if (value.nivel === 1) {
			// Extract the genus name
			const genusName = value.scientificName.la;
	
			// Check if genusName is not already a key in Datos.newtaxons
			if (!Datos.newtaxons[genusName]) {
				// Initialize an empty array for the genus
				Datos.newtaxons[genusName] = [];
			}
	
			// Iterate over the subclasses and extract species names along with their subclass URLs
			const speciesInfo = value.subclasses.map(subclass => {
				// Get the species object using the subclass URL
				const speciesObj = Datos.taxones[subclass];
				const lastpart=subclass.split('/').pop()
				// Return an array with the scientific name and the subclass URL
				return [speciesObj.scientificName.la, lastpart];
			});
	
			// Push the species names and subclass URLs to the corresponding genus array in Datos.newtaxons
			Datos.newtaxons[genusName].push(...speciesInfo);
		}
	}

	console.log(Datos.newtaxons);
	



};



// obtengo los datos de provincias
async function getProvincesInfo() {
	// 1) llamo a la consulta provinces a CRAFTS (no necesita parámetros) para recuperar las IRIs de las provincias y nplots
	const datos = await Crafts.getData(config.craftsConfig.queryProvinces, {});
	// console.log("Province data fetched:", datos);
	// guardo IRI y nplots (si existe)
	for (let row of datos.results.bindings) {
		// obtengo datos
		let prov = { iri: row.prov.value };
		if (row.nplots)
			prov.nallplots = Number(row.nplots.value);
		// guardo también si es portuguesa la IRI
		prov.isPortuguese = prov.iri.startsWith('http://crossforest.eu/ifi/data/nuts3/PT/');
		// guardo
		Datos.provs[prov.iri] = prov;
	}
	
	// 2) obtengo los datos de las provincias
	let promesas = [];
	// compruebo si tengo los datos mirando la primera provincia
	const pruris = Object.keys(Datos.provs);
	// pido descomponer en objetos para la llamada resources de CRAFTS	
	const objrs = descomponerCraftsResources('Province', pruris);			
	// ya tengo los objetos a pedir, lanzo las peticiones en paralelo a CRAFTS		
	for (let objr of objrs) {
		// creo una promesa para cada petición
		promesas.push( new Promise(async function(resolve, reject) {
			try {
				// hago la llamada a CRAFTS	y espero resultados
				let datos = await Crafts.getData(config.craftsConfig.resourcesTemplate, objr);
				// console.log("Province data for", objr, ":", datos);
				// convierto en array si es necesario
				if (!Array.isArray(datos))
					datos = [ datos ];			
				// actualizo provincia a provincia
				for (let dato of datos) {
					if (dato.infoSpecies) 
						Datos.provs[dato.iri].infoSpecies = dato.infoSpecies;
					if (dato.label)
						Datos.provs[dato.iri].label = dato.label;
					if (dato.wkt)
						Datos.provs[dato.iri].geometry = parse(dato.wkt); // transformo a GeoJSON
					// console.log(Datos.provs[dato.iri]);
				}
				// resuelvo la promesa
				resolve(true);
			} catch(err) {
				reject(err);
			}
		}) );
	}
	
	// proceso consultas cacheadas mientras espero a las promesas
	
	// 3) proceso la consulta cacheada "countPlotsPerAllTaxonsProv"
	// obtengo todas las uris de las especies
	const txuris = Object.keys(Datos.taxones);
	// inicializo nplots de todas las especies para todas las provincias CON DATOS DE PARCELAS
	for (let pruri of pruris) {
		const prov = Datos.provs[pruri];
		if (prov.nallplots) {
			prov.nplots = {};
			for (let txuri of txuris)
				prov.nplots[txuri] = 0;
				// console.log(`Initialized nplots for province ${pruri}:`, prov.nplots);
		}
	}
	
	// guardo el número de parcelas por provincia y especie
	for (let row of CachedQueries.countPlotsPerAllTaxonsProv.results.bindings) {
		// obtengo datos
		const pruri = row.prov.value;
		const txuri = row.tx.value;
		const nplots = Number(row.nplots.value);	
		// y guardo número de parcelas en la provincia por especie
		const prov = Datos.provs[pruri];
		if (prov && prov.nplots) 
			prov.nplots[txuri] = nplots;
			// let combinedPlots=0;
			// for (let txuri in prov.nplots) {
			// 	combinedPlots += prov.nplots[txuri]; // Accumulate the number of plots for each taxon
			// }
			// console.log(`Combined number of plots for province ${prov.iri}:`, prov.nallplots);
	}
	


	


	
	
	// borro los datos cacheados
	delete CachedQueries.countPlotsPerAllTaxonsProv; 
	
	// 4) proceso la consulta cacheada "countTreesPerTaxonProv"	
	// inicializo ntrees para todas las provincias CON DATOS DE PARCELAS
	for (let pruri of pruris) {
		const prov = Datos.provs[pruri];
		if (prov.nallplots) 
			prov.ntrees = {};
	}
	// guardo el número de árboles de cada especie por provincia
	for (let row of CachedQueries.countTreesPerTaxonProv.results.bindings) {
		// obtengo datos
		const pruri = row.prov.value;
		const txuri = row.tx.value;
		const ntrees = Number(row.ntrees.value);
		// y guardo número de árboles por especie en la provincia
		const prov = Datos.provs[pruri];
		if (prov) 
			prov.ntrees[txuri] = ntrees;
	}
	// borro los datos cacheados
	delete CachedQueries.countTreesPerTaxonProv;	
	
	// espero a que terminen todas las promesas
	await Promise.all(promesas);
}


//////////
// PATCHES
//////////

// función clave para obtener los candidatos para cachear datos de teselas
function getCeldasTeselasCandidatas(arriba, ocgm, cz) {
	// detecto primero si es la capa de baja resolución o la de alta (cambia mucho el comportamiento)
	const esLow = cz < config.zCambioCapaTeselas;
	// calculo rango de zooms permitidos según capa
	// en la capa de baja resolución no permito cachear hacia arriba
	// (de otra manera aberraciones por cambio área mínima)
	const zini = esLow? cz : config.zCambioCapaTeselas;
	// hacia abajo tengo en cuenta el cambio de capa y un máximo de 3 niveles para evitar explosión
	let zfin = esLow? config.zCambioCapaTeselas - 1 : config.zMaxCelda;
	if (zfin > cz + 3)
		zfin = cz +3;
	// obtengo candidatos sin incluir el zoom cz
	let objc = {};
	for (let z=zini; z<=zfin; z++) {
		// aquí es donde miro si es hacia arriba o hacia abajo
		if ( (arriba && z < cz) || (!arriba && z > cz) ) {
			if (ocgm[z]) { // sólo procedo si existe el nivel correspondiente de zoom
				objc[z] = []; // un array por nivel de zoom
				for (let x=ocgm[z].cellW; x<=ocgm[z].cellE; x++) {
					for (let y=ocgm[z].cellS; y<=ocgm[z].cellN; y++) {
						const et = 'z' + z + '_x' + x + '_y' + y;
						objc[z].push(et); // le enchufo la etiqueta
					}
				}
			}		
		}
	}
	return objc;
}
function getQueryCeldaTeselas(cellX, cellY, zoom) {
	// preparo objeto consulta celda
	const bounds = getCeldaBounds(cellX, cellY, zoom);
	let qobj = {
		"layer" : zoom < config.zCambioCapaTeselas? config.lowresPatchLayer : config.simplifiedPatchLayer,
		"latsouth" : bounds.getSouth(),
		"latnorth" : bounds.getNorth(),
		"lngwest" : bounds.getWest(),
		"lngeast" : bounds.getEast(),
		"limit" : 10000
	};
	// restricción de areamin SÓLO PARA CAPA LOWRES
	if (zoom < config.zCambioCapaTeselas) {
		const potencia = Math.pow(4, zoom - 6); // debe ser entre 4 (2D) en vez de 2 (1D)
		qobj.areamin = config.minAreaStep6 / potencia;
	}
	// devuelvo
	return qobj;
}
async function processPatchCell(objcell) {
	// preparo qobj por si tengo que hacer una petición a CRAFTS
	let qobj = getQueryCeldaTeselas(objcell.cellX, objcell.cellY, objcell.zoom);
	
	// preinicializo la celda si no existe
	if (!Datos.celdasTeselas[objcell.et])
		Datos.celdasTeselas[objcell.et] = { "pending": true };
	
	// OBTENGO CANDIDATOS PARA EL CACHEO
	// obtengo matriz de grids para esta celda (pero sólo para los zooms usados)
	const ocgm = getCeldaGridMatrix(objcell.cellX, objcell.cellY, objcell.zoom, Sesion.zoomUsados);
	// aquí tengo las celdas candidatas por nivel de zoom (generales y específicas, incluyendo la etiqueta de mycell)
	const candgen = getCeldasTeselasCandidatas(true, ocgm, objcell.zoom);
	const candesp = getCeldasTeselasCandidatas(false, ocgm, objcell.zoom);
	
	// compruebo si hay que obtener las teselas de la celda
	if (Datos.celdasTeselas[objcell.et].pending) {
		// obtengo las teselas de la celda		
		// inicializo turis como un objeto para guardar las teselas recuperadas
		let turis = {};
		
		// si la celda no está en una zona válida (Iberia o Canarias) me ahorro las consultas
		let valida = false;
		const celdabounds = getCeldaBounds(objcell.cellX, objcell.cellY, objcell.zoom);
		for (let zona of config.zonasValidas) {
			const zonabounds = L.latLngBounds(zona);
			if (zonabounds.intersects( celdabounds ) )
				valida = true;
		}	
		if (valida) {
			// intento cachear datos
			let bingo = false;
			// para el cacheo tengo en cuenta si es la CAPA LOWRES	
			// 1) posible inferencia: tengo los datos de la celda del nivel superior (no posible en LOWRES)
			// (en la llamada a getCeldasTeselasCandidatas ya se tiene en cuenta que en LOWRES no se puede cachear de arriba)
			for (const z in candgen) {
				if (!bingo) {
					bingo = true; // inicializo para este bucle
					for (const et of candgen[z]) { // necesito todas las celdas de z
						if (!Datos.celdasTeselas[et] || Datos.celdasTeselas[et].pending) {
							bingo = false;
							break; // rompo bucle
						}
					}
					// guardo datos en caso de bingo
					if (bingo) {
						//console.info("Cacheo gen para celda " + objcell.et); // TODO
						for (const et of candgen[z]) { // necesito todas las celdas de z
							for (let turi of Datos.celdasTeselas[et]) {
								// sólo incluyo las teselas contenidas en la celda
								const tev = Datos.teselas[turi];
								if (celdabounds.getWest() <= tev.east && celdabounds.getEast() >= tev.west
										&& celdabounds.getNorth() >= tev.south && celdabounds.getSouth() <= tev.north)
									turis[turi] = true;
							}
						}
					}
				}
			}
			// 2) posible inferencia: tengo todos los datos de las celdas específicas
			if (!bingo) {
				for (const z in candesp) {
					if (!bingo) {			
						bingo = true; // inicializo para este bucle
						for (const et of candesp[z]) { // necesito todas las celdas de z
							if (!Datos.celdasTeselas[et] || Datos.celdasTeselas[et].pending) {
								bingo = false;
								break; // rompo bucle
							}
						}
						// guardo datos en caso de bingo
						if (bingo) {
							//console.info("Cacheo esp para celda " + objcell.et); // TODO
							for (const et of candesp[z]) { // necesito todas las celdas de z
								for (let turi of Datos.celdasTeselas[et]) {
									// sólo las que superen el área mínima de tenerlo
									if (!qobj.areamin || Datos.teselas[turi].area >= qobj.areamin) 
										turis[turi] = true;
								}
							}
						}
					}
				}
			}
		
			// no hubo suerte, obtengo las teselas de la celda para la primera página
			if (!bingo) {
				let indpag = 0;
				let maspags = false;
				do {
					// ajuste offset
					qobj.offset = indpag * qobj.limit;
		
					// hago la llamada a CRAFTS	y espero resultados
					objcell.npc.push(1);
					const datos = await Crafts.getData(config.craftsConfig.queryPatchesinbox, qobj);
				
					// proceso los resultados (válido incluso con 0 resultados)
					for (let row of datos.results.bindings) {
						// continue only if not blank nodes
						if (row.patch.type === "uri" && row.poly.type === "uri") {
							// obtengo uri de la tesela
							const turi = row.patch.value;
							// recupero datos de la tesela y guardo si no estaba antes
							if (Datos.teselas[turi] == undefined) {
								let patch = {
									'iri': turi,
									'poly': row.poly.value,
									'west': Number(row.west.value),
									'east': Number(row.east.value),
									'north': Number(row.north.value),
									'south': Number(row.south.value),
									'area': Number(row.area.value),
									'pending': true // marco que está pendiente recuperar sus datos
								};
								Datos.teselas[turi] = patch;				
							}	
							// guardo la uri de la tesela
							turis[turi] = true; // si turi estuviera repetida se sobre-escribiría
						}
					}
	
					// detecto si hay más páginas
					maspags = !(datos.results.bindings.length < qobj.limit);
					// incremento el índice
					indpag++;
				} while(maspags);
			}
		}
		
		// guardo turis en mi celda
		Datos.celdasTeselas[objcell.et] = Object.keys(turis); // aquí me quedo sólo con las claves		
	}
	
	// actualizo progreso
	if (objcell.idtimeout == Sesion.idTimeoutActualizar) {
		Sesion.infoCeldasTeselas.mediadas.push(1);
		if (objcell.progreso)
			objcell.progreso(true);
	}	
		
	// recupero la info completa de las teselas de la celda sólo si no saltó el temporizador
	if (objcell.idtimeout == Sesion.idTimeoutActualizar)
		await getPatchesCell(Datos.celdasTeselas[objcell.et], objcell);
	
	// actualizo info del número de consultas y si la celda estaba cacheada (si no hizo falta hacer consultas)
	if (objcell.idtimeout == Sesion.idTimeoutActualizar) { // sólo si no ha vencido el temporizador	
		Sesion.infoCeldasTeselas.finalizadas.push(1);
		const totnpc = _.reduce(objcell.npc, function(memo, num){ return memo + num; }, 0);
		if (totnpc == 0)
			Sesion.infoCeldasTeselas.cacheadas.push(1);
		Sesion.infoCeldasTeselas.npc.push(totnpc);
		
		// actualizo la barra de progreso (sólo si no ha vencido el temporizador)
		if (objcell.progreso)
			objcell.progreso(true);		
		
		// LOG (quitar)
		//console.log("Celda " + objcell.et + " - #teselas: " + Datos.celdasTeselas[objcell.et].length + " - #npc: " + totnpc);
	}	
	
	// hacemos el render (ya se tiene en cuenta en la función si se tiene que pintar o no)
	if (objcell.render)
		objcell.render(Datos.celdasTeselas[objcell.et]);

	// fue todo bien, resuelvo la promesa
	return Promise.resolve();
}
async function getPatchesCell(mycell, objcell) {
	//console.info("T - Celda " + objcell.et + " - obteniendo info de " + mycell.length + " teselas");
	// obtengo las teselas de las que no tengo datos
	let pendingpuris = _.filter(mycell, function(turi) {
		return Datos.teselas[turi].pending != undefined;
	});
	if (pendingpuris.length == 0)
		return;
		
	//console.timeEnd("Pending I" + objt.idtimeout + " #box: " + indbox + " #pag: " + indpag); // TODO
	// pido descomponer en objetos para la llamada resources de CRAFTS	
	const objrs = descomponerCraftsResources('Patch', pendingpuris);
	
	// pido en secuencia
	try {	
		for (let objr of objrs) {
			// hago la llamada a CRAFTS	y espero resultados
			objcell.npc.push(1);
			let datos = await Crafts.getData(config.craftsConfig.resourcesTemplate, objr);
			// convierto en array si es necesario
			if (!Array.isArray(datos))
				datos = [ datos ];			
			// y actualizo tesela a tesela
			for (let dato of datos) {
				if (Datos.teselas[dato.iri].pending) {				
					let tesela = Datos.teselas[dato.iri];
					// actualizo según el modelo de la API en CRAFTS (revisar!)
					if (dato.infoSpecies)
						tesela.infoSpecies = dato.infoSpecies;
					if (dato.province)
						tesela.province = dato.province;
					if (dato.canopyCoverTreesPercent)
						tesela.canopyCoverTreesPercent = dato.canopyCoverTreesPercent;
					if (dato.soilUse)
						tesela.soilUse = dato.soilUse;
					if (dato.infoSoil)
						tesela.infoSoil = dato.infoSoil;																
					// la geometría la resuelvo de manera especial					
					if (dato.wkt)
						tesela.geometry = parse(dato.wkt); // transformo a GeoJSON
					// por último, quito el flag de pending
					delete tesela.pending;
				}
			}
		}
	} catch(err) {
		console.error(err);
	}
}


////////
// PLOTS
////////

// función clave para obtener los candidatos para cachear datos de parcelas
function getCeldasParcelasCandidatas(arriba, ocgm, cz) {	
	// calculo rango de zooms permitidos
	const zini = config.zParcela;
	// hacia abajo permito un máximo de 3 niveles para evitar explosión
	const zfin = cz + 3 > config.zMaxCelda? config.zMaxCelda : cz + 3;
	// obtengo candidatos sin incluir el zoom cz
	let objc = {};
	for (let z=zini; z<=zfin; z++) {
		// aquí es donde miro si es hacia arriba o hacia abajo
		if ( (arriba && z < cz) || (!arriba && z > cz) ) {
			if (ocgm[z]) { // sólo procedo si existe el nivel correspondiente de zoom
				objc[z] = []; // un array por nivel de zoom
				for (let x=ocgm[z].cellW; x<=ocgm[z].cellE; x++) {
					for (let y=ocgm[z].cellS; y<=ocgm[z].cellN; y++) {
						const et = 'z' + z + '_x' + x + '_y' + y;
						objc[z].push(et); // le enchufo la etiqueta
					}
				}
			}		
		}
	}
	return objc;
}
function getQueryCeldaParcelas(cellX, cellY, zoom) {
	// preparo objeto consulta celda
	const bounds = getCeldaBounds(cellX, cellY, zoom);
	let qobj = {
		"latsouth" : bounds.getSouth(),
		"latnorth" : bounds.getNorth(),
		"lngwest" : bounds.getWest(),
		"lngeast" : bounds.getEast(),
		"limit" : 10000
	};
	return qobj;
}
async function processPlotCell(objcell) {
	// preparo qobj por si tengo que hacer una petición a CRAFTS
	let qobj = getQueryCeldaParcelas(objcell.cellX, objcell.cellY, objcell.zoom);
	
	//console.log(qobj); // TODO
	
	// preinicializo la celda si no existe
	if (!Datos.celdasParcelas[objcell.et])
		Datos.celdasParcelas[objcell.et] = { "pending": true };	
	
	// OBTENGO CANDIDATOS PARA EL CACHEO
	// obtengo matriz de grids para esta celda (pero sólo para los zooms usados)
	const ocgm = getCeldaGridMatrix(objcell.cellX, objcell.cellY, objcell.zoom, Sesion.zoomUsados);
	// aquí tengo las celdas candidatas por nivel de zoom (generales y específicas, incluyendo la etiqueta de mycell)
	const candgen = getCeldasParcelasCandidatas(true, ocgm, objcell.zoom);
	const candesp = getCeldasParcelasCandidatas(false, ocgm, objcell.zoom);
	
	// compruebo si hay que obtener las parcelas de la celda
	if (Datos.celdasParcelas[objcell.et].pending) {
		// obtengo las parcelas de la celda		
		// inicializo puris como un objeto para guardar las parcelas recuperadas
		let puris = {};
		
		// si la celda no está en una zona válida (Iberia o Canarias) me ahorro las consultas
		let valida = false;
		const celdabounds = getCeldaBounds(objcell.cellX, objcell.cellY, objcell.zoom);
		for (let zona of config.zonasValidas) {
			const zonabounds = L.latLngBounds(zona);
			if (zonabounds.intersects( celdabounds ) )
				valida = true;
		}
		if (valida) {
			// intento cachear datos
			let bingo = false;
			// 1) posible inferencia: tengo los datos de la celda del nivel superior
			for (const z in candgen) {
				if (!bingo) {
					bingo = true; // inicializo para este bucle
					for (const et of candgen[z]) { // necesito todas las celdas de z
						if (!Datos.celdasParcelas[et] || Datos.celdasParcelas[et].pending) {
							bingo = false;
							break; // rompo bucle
						}
					}
					// guardo datos en caso de bingo
					if (bingo) {
						//console.info("Cacheo gen para celda " + objcell.et); //
						for (const et of candgen[z]) { // necesito todas las celdas de z
							for (let puri of Datos.celdasParcelas[et]) {
								// sólo incluyo las parcelas contenidas en la celda								
								const pev = Datos.parcelas[puri];
								if (celdabounds.getWest() <= pev.lng && celdabounds.getEast() >= pev.lng
										&& celdabounds.getNorth() >= pev.lat && celdabounds.getSouth() <= pev.lat)
									puris[puri] = true;
							}
						}
					}
				}
			}
			// 2) posible inferencia: tengo todos los datos de las celdas específicas
			if (!bingo) {
				for (const z in candesp) {
					if (!bingo) {			
						bingo = true; // inicializo para este bucle
						for (const et of candesp[z]) { // necesito todas las celdas de z
							if (!Datos.celdasParcelas[et] || Datos.celdasParcelas[et].pending) {
								bingo = false;
								break; // rompo bucle
							}
						}
						// guardo datos en caso de bingo
						if (bingo) {
							//console.info("Cacheo esp para celda " + objcell.et); //
							for (const et of candesp[z]) { // necesito todas las celdas de z
								for (let puri of Datos.celdasParcelas[et])
									puris[puri] = true;
							}
						}
					}
				}
			}
		
			// no hubo suerte, obtengo las parcelas de la celda para la primera página
			if (!bingo) {			
				//console.log(objcell.et + " - obteniendo lista de parcelas..."); // TODO			
				let indpag = 0;
				let maspags = false;
				do {
					// ajuste offset
					qobj.offset = indpag * qobj.limit;
		
					// hago la llamada a CRAFTS	y espero resultados
					objcell.npc.push(1);
					const datos = await Crafts.getData(config.craftsConfig.queryPlotsinbox, qobj);
				
					// proceso los resultados (válido incluso con 0 resultados)
					for (let row of datos.results.bindings) {
						// continue only if not blank nodes
						if (row.plot.type === "uri") {
							// obtengo uri de la parcela
							const puri = row.plot.value;
							// recupero datos de la tesela y guardo si no estaba antes
							if (Datos.parcelas[puri] == undefined) {
								const plot = {
									'iri': puri,
									'lat': Number(row.lat.value),
									'lng': Number(row.lng.value),
									'pending': true, // marco que está pendiente recuperar sus datos
									'countPending': true // marco que está pendiente recuperar la cuenta de especies
								};
								Datos.parcelas[puri] = plot;				
							}	
							// guardo la uri de la parcela
							puris[puri] = true; // si turi estuviera repetida se sobre-escribiría
						}
					}
	
					// detecto si hay más páginas
					maspags = !(datos.results.bindings.length < qobj.limit);
					// incremento el índice
					indpag++;
				} while(maspags);
			}
		}
		
		// guardo puris en mi celda
		Datos.celdasParcelas[objcell.et] = Object.keys(puris); // aquí me quedo sólo con las claves		
	}
	
	//console.log(objcell.et + " - #parcelas: " + Datos.celdasParcelas[objcell.et].length); // TODO
	
	// actualizo progreso
	if (objcell.idtimeout == Sesion.idTimeoutActualizar) {
		Sesion.infoCeldasParcelas.mediadas.push(1);
		if (objcell.progreso)
			objcell.progreso(true);
	}
	
	// recupero la info completa de las parcelas de la celda sólo si no saltó el temporizador
	if (objcell.idtimeout == Sesion.idTimeoutActualizar)
		await getPlotsCell(Datos.celdasParcelas[objcell.et], objcell);
	
	// recupero los árboles de las parcelas si toca y si no saltó el temporizador
	if (objcell.modoArbol && objcell.idtimeout == Sesion.idTimeoutActualizar)
		await getTreesCell(Datos.celdasParcelas[objcell.et], objcell);
	
	// actualizo info del número de consultas y si la celda estaba cacheada (si no hizo falta hacer consultas)
	if (objcell.idtimeout == Sesion.idTimeoutActualizar) { // sólo si no ha vencido el temporizador	
		Sesion.infoCeldasParcelas.finalizadas.push(1);
		const totnpc = _.reduce(objcell.npc, function(memo, num){ return memo + num; }, 0);
		if (totnpc == 0)
			Sesion.infoCeldasParcelas.cacheadas.push(1);
		Sesion.infoCeldasParcelas.npc.push(totnpc);
		
		// actualizo la barra de progreso (sólo si no ha vencido el temporizador)
		if (objcell.progreso)
			objcell.progreso(true);		
		
		// LOG (quitar)
		//console.log("Celda " + objcell.et + " - #teselas: " + Datos.celdasTeselas[objcell.et].length + " - #npc: " + totnpc);
	}	
	
	// hacemos el render (ya se tiene en cuenta en la función si se tiene que pintar o no)
	if (objcell.render)
		objcell.render(Datos.celdasParcelas[objcell.et]);

	// fue todo bien, resuelvo la promesa
	return Promise.resolve();
}
async function getPlotsCell(mycell, objcell) {
	//console.info("P - Celda " + objcell.et + " - obteniendo info de " + mycell.length + " parcelas");
	// obtengo las parcelas de las que no tengo datos
	let pendingpuris = _.filter(mycell, function(puri) {
		return Datos.parcelas[puri].pending != undefined;
	});
	
	//console.log(objcell.et + " - #parcelas pendientes: " + pendingpuris.length); // TODO
				
	if (pendingpuris.length > 0) {
		// pido descomponer en objetos para la llamada resources de CRAFTS	
		const objrs = descomponerCraftsResources('Plot', pendingpuris);

		//console.log(objcell.et + " - #paquetes de peticiones de parcelas: " + objrs.length); // TODO

		// pido en secuencia
		try {	
			for (let objr of objrs) {
				// hago la llamada a CRAFTS	y espero resultados
				objcell.npc.push(1);
				let datos = await Crafts.getData(config.craftsConfig.resourcesTemplate, objr);
				// convierto en array si es necesario
				if (!Array.isArray(datos))
					datos = [ datos ];			
				// y actualizo parcela a parcela
				for (let dato of datos) {
					if (Datos.parcelas[dato.iri].pending) {				
						let parcela = Datos.parcelas[dato.iri];
						// actualizo según el modelo de la API en CRAFTS (revisar!)
						if (dato.infoSpecies)
							parcela.infoSpecies = dato.infoSpecies;
						if (dato.province)
							parcela.province = dato.province;
						// por último, quito el flag de pending
						delete parcela.pending;
					}
				}
			}
		} catch(err) {
			console.error(err);
			return;
		}
	}
	
	// obtengo las parcelas de las que no tengo cuenta de árboles por especie
	let countpuris = _.filter(mycell, function(puri) {
		return Datos.parcelas[puri].countPending != undefined;
	});
	if (countpuris.length > 0) {
		try {
			// hago llamadas con lotes de 60 uris de countpuris
			const lote = 60;
			for (let ind=0; countpuris.length > ind*lote; ind++) {
				// inicializo objeto de la petición a CRAFTS
				let objr = {
					piris: countpuris.slice(ind*lote, (ind + 1)*lote)
				};
				// hago la llamada a CRAFTS	y espero resultados
				objcell.npc.push(1);
				const datos = await Crafts.getData(config.craftsConfig.queryCountspeciesplots, objr);
				// extraigo los resultados
				for (let row of datos.results.bindings) {
					const puri = row.plot.value;
					const species = row.species.value
					const ntrees = Number(row.ntrees.value);
					// inicializo si hace falta
					if (!Datos.parcelas[puri].ntrees)
						Datos.parcelas[puri].ntrees = {};
					// y guardo
					Datos.parcelas[puri].ntrees[species] = ntrees;
				}			
				// para toda el lote quito el flag de countPending
				for (let puri of objr.piris)
					delete Datos.parcelas[puri].countPending;
			}
		} catch(err) {
			console.error(err);
			return;
		}
	}
}

async function getTreesCell(mycell, objcell) {
	//console.info("A - Celda " + objcell.et + " - obteniendo árboles de " + mycell.length + " parcelas");	
	// obtengo las parcelas de las que no tengo datos de árboles
	let pendingpuris = _.filter(mycell, function(puri) {
		return Datos.parcelas[puri].arbs == undefined;
	});
		
	// 1) obtengo los árboles de las parcelas y sus localizaciones
	if (pendingpuris.length > 0) {
		try {
			// hago llamadas con lotes de 60 uris de pendingpuris
			const lote = 60;
			for (let ind=0; pendingpuris.length > ind*lote; ind++) {
				// inicializo objeto de la petición a CRAFTS
				let objr = {
					piris: pendingpuris.slice(ind*lote, (ind + 1)*lote)
				};
				// hago la llamada a CRAFTS	y espero resultados
				objcell.npc.push(1);
				const datos = await Crafts.getData(config.craftsConfig.queryTreesinplots, objr);
				// inicializo el array de árboles por parcela (ya que ha habido respuesta buena)
				for (let puri of objr.piris)
					Datos.parcelas[puri].arbs = [];
				// extraigo los resultados
				for (let row of datos.results.bindings) {
					// obtengo datos
					const tree = {
						'iri': row.tree.value,
						'plot': row.plot.value,
						'lat': Number(row.lat.value),
						'lng': Number(row.lng.value),
						'pending': true, // marco que está pendiente recuperar sus datos
					};
					// guardo
					if (!Datos.arboles[tree.iri])
						Datos.arboles[tree.iri] = tree;
					Datos.parcelas[tree.plot].arbs.push(tree.iri);
				}
			}
		} catch(err) {
			console.error(err);
			return;
		}
	}
	
	// 2) obtengo el resto de info de los árboles
	// obtengo las uris de todos los árboles de la celda de parcelas
	let auris = [];
	for (let puri of mycell) {
		if (Datos.parcelas[puri].arbs)
			auris = auris.concat(Datos.parcelas[puri].arbs);	
	}
	// obtengo las uris de todos los árboles a los que les faltan datos
	let pendingauris = _.filter(auris, function(auri) {
		return Datos.arboles[auri].pending != undefined;
	});
	if (pendingauris.length > 0) {		
		// pido descomponer en objetos para la llamada resources de CRAFTS	
		const objrs = descomponerCraftsResources('Tree', pendingauris);	
		// pido en secuencia
		try {	
			for (let objr of objrs) {
				// hago la llamada a CRAFTS	y espero resultados
				objcell.npc.push(1);
				let datos = await Crafts.getData(config.craftsConfig.resourcesTemplate, objr);
				// convierto en array si es necesario
				if (!Array.isArray(datos))
					datos = [ datos ];			
				// y actualizo árbol a árbol
				for (let dato of datos) {
					if (Datos.arboles[dato.iri].pending) {
						// guardo 
						Object.assign(Datos.arboles[dato.iri], dato);
						// quito el flag de pending
						delete Datos.arboles[dato.iri].pending;
					}
				}
			}
		} catch(err) {
			console.error(err);
			return;
		}	
	}
}

async function plotsOfProvince(layer,provinceName){
	let  filteredPlots,flattenedInfoOfPlots;
	let data_info;
	const layerBounds=layer.getBounds()
	
	// console.log(layerBounds);
	const northEast = layerBounds.getNorthEast(); // Get the northeastern corner
	const southWest = layerBounds.getSouthWest(); // Get the southwestern corner

	const north = northEast.lat; // Latitude of the northern point
	const east = northEast.lng; // Longitude of the eastern point
	const south = southWest.lat; // Latitude of the southern point
	const west = southWest.lng; // Longitude of the western point

	// console.log("Northern point:", north);
	// console.log("Eastern point:", east);
	// console.log("Southern point:", south);
	// console.log("Western point:", west);

	let qobj = {
		"latsouth" : south,
		"latnorth" : north,
		"lngwest" : west,
		"lngeast" : east,
		"limit" : 10000
	};
		// ajuste offset
	let indpag=0;
	let maspags = false;
	// hago la llamada a CRAFTS	y espero resultados
	do{
		qobj.offset = indpag * qobj.limit;

		const datos = await Crafts.getData(config.craftsConfig.queryPlotsinbox, qobj);
				// console.lo

				// Extract the results from the datos object
		// console.log(datos);
		const results = datos.results.bindings;
		// console.log(results);
		// Extract the coordinates of the plots
		const plots = results.map(result => ({
			name: result.plot.value,
			latitude: parseFloat(result.lat.value),
			longitude: parseFloat(result.lng.value)
		}));

		// // Extract the coordinates of the layer's feature geometry
		// const layerCoordinates = layer.feature.geometry.coordinates[0]; // Assuming it's the first set of coordinates

		// // Convert the layer's geometry to a Turf.js polygon
		// const layerPolygon = turf.polygon([layerCoordinates]);

		// console.log("Layer Polygon:", layerPolygon);
		// // console.log("Layer Polygon:", layerPolygon);

		// 		// Filter the plots that fall within the boundaries of the layer's geometry
		// filteredPlots = plots.filter(plot => {
		// 	const plotPoint = turf.point([plot.longitude, plot.latitude]); // Create a Turf.js point

		// 	// console.log("Plot Point:", plotPoint);

		// 	// Check if the plot point is inside the layer polygon
		// 	return turf.booleanPointInPolygon(plotPoint, layerPolygon);
		// });

		// console.log("Filtered Plots:", filteredPlots);

		// Extract the coordinates of the layer's feature geometry
		const layerCoordinates = layer.feature.geometry.coordinates;

		let layerGeometry;
		if (layerCoordinates.length === 1) {
			// If there's only one set of coordinates, assume it's a single polygon
			layerGeometry = turf.polygon(layerCoordinates);
		} else {
			// If there are multiple sets of coordinates, assume it's a MultiPolygon
			layerGeometry = turf.multiPolygon(layerCoordinates);
		}

		// console.log("Layer Geometry:", layerGeometry);

		// Filter the plots that fall within the boundaries of any polygon in the layer's geometry
		filteredPlots = plots.filter(plot => {
			const plotPoint = turf.point([plot.longitude, plot.latitude]); // Create a Turf.js point

			// Check if the plot point is inside any of the polygons in the layer geometry
			return turf.booleanPointInPolygon(plotPoint, layerGeometry);
		});

		// console.log("Filtered Plots:", filteredPlots);
		
	
		maspags = !(datos.results.bindings.length < qobj.limit);
		// incremento el índice
		indpag++;
	}while(maspags);// detecto si hay más páginas
	
	// console.log(filteredPlots);
	

	//GET INFO FOR FILTERED PLOTS
	const filteredPlotNames = filteredPlots.map(plot => plot.name);

	console.log("LangLongPLots",filteredPlots);
	// console.log("Filtered Plot Names:", filteredPlotNames);
	const objrs = descomponerCraftsResources('Plot', filteredPlotNames);
	console.log("objrs:",objrs);

	const nsAfter=filteredPlotNames[0].substring(0, filteredPlotNames[0].lastIndexOf('/') + 1);
	// console.log(nsAfter);
	// console.log(filteredPlotNames);
	
	const infoOfPlots=[];
	try {
		for (let objr of objrs) {
			data_info = await Crafts.getData(config.craftsConfig.resourcesTemplate, objr);
			infoOfPlots.push(data_info);
			
			
		}
		flattenedInfoOfPlots = infoOfPlots.flat();
		console.log("SpeciesInfo PLots",flattenedInfoOfPlots);
		
		
	} catch (error) {
		console.log(err);
		return ;
	}
	
		// Create an empty JSON object to store the data
// console.log("SpeciesInfo Plots",flattenedInfoOfPlots);
const provinceData = {};

// Add the province name as the Dominant label
provinceData.Province = provinceName;



// Add the number of plots
provinceData.NumberOfPlots = filteredPlots.length;



// Iterate over the filteredPlots and flattenedInfoOfPlots arrays simultaneously
console.log(filteredPlots.length);
for (let i = 0; i < filteredPlots.length && i < flattenedInfoOfPlots.length; i++) {
    const plot = filteredPlots[i];
    const info = flattenedInfoOfPlots[i];
	// console.log(info.infoSpecies.length);

    // Check if the name of the plot in filteredPlots matches the iri property in flattenedInfoOfPlots
    if (plot.name === info.iri) {
        // Modify the plot name to the desired format
        const plotID = plot.name.split('/').pop(); // Get the last part of the URL
        const modifiedPlotName = `plot_${plotID}`;
		
        // Create an object to store plot information
        const plotInfo = {
            name: modifiedPlotName,
            latitude: plot.latitude,
            longitude: plot.longitude,
			infoSpecies:[],
			ns:nsAfter
        };
		// Check if infoSpecies exists and handle it accordingly
        if (info.infoSpecies) {
            if (Array.isArray(info.infoSpecies)) {
                // If infoSpecies is an array, iterate through it
                info.infoSpecies.forEach(speciesInfo => {
                    if (speciesInfo.basalArea) {
                        plotInfo.infoSpecies.push(speciesInfo);
                    }
                });
            } else  {
                // If infoSpecies is a single object
                if (info.infoSpecies.basalArea) {
                    plotInfo.infoSpecies.push(info.infoSpecies);
                }
            }
        } else {
            console.log(`infoSpecies is undefined or not an array for plot: ${info.iri}`);
        }

		// Collect all unique species, keeping only the last identifier after the last /
		const uniqueSpecies = new Set();
		plotInfo.infoSpecies.forEach(speciesInfo => {
			const speciesID = speciesInfo.species.split('/').pop(); // Get the last part of the species URL
			uniqueSpecies.add(speciesID);
		});
		plotInfo.uniqueSpecies = Array.from(uniqueSpecies); // Convert Set to Array
		
		// // Check if infoSpecies exists in the info object before accessing it
        // if (info.infoSpecies && info.infoSpecies.length > 0) {
        //     plotInfo.infoSpecies = info.infoSpecies[0];


		// 	// // Collect all unique species, keeping only the last identifier after the last /
        //     // const uniqueSpecies = new Set();
        //     // info.infoSpecies.forEach(speciesInfo => {
        //     //     const speciesID = speciesInfo.species.split('/').pop(); // Get the last part of the species URL
        //     //     uniqueSpecies.add(speciesID);
        //     // });
        //     // plotInfo.uniqueSpecies = Array.from(uniqueSpecies); // Convert Set to Array


        // }

        // Push the plot information into the provinceData JSON object under the province name
        if (!provinceData[modifiedPlotName]) {
            provinceData[modifiedPlotName] = [];
        }
        provinceData[modifiedPlotName].push(plotInfo);
    }
}
	// console.log("hi");
	// console.log(provinceData);

	return provinceData;
	

}



export { getUsesInfo, getTaxonsInfo, getProvincesInfo, processPatchCell, processPlotCell,plotsOfProvince,descomponerCraftsResources,taxonsChange };