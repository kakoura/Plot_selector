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
import _ from 'underscore';
import mix from 'mix-css-color';
import $ from "jquery";

// PARSING LOCATIONS
function string2loc(cad) {
	const cachos = cad.split(",");
	if (cachos.length == 3) {
		const latpars = cachos[0];
		const lngpars = cachos[1];
		const zpars = cachos[2].split("z")[0];
		// compruebo que los valores estén bien antes de reajustar
		if ( !isNaN( Number(latpars) ) ) {
			if ( !isNaN( Number(lngpars) ) ) {
				if ( Number.isInteger( Number(zpars) ) ) {
					if ( Number(latpars) >= -90 &&  Number(latpars) <= 90 ) {
						// LOCALIZACIÓN CORRECTA
						let obj = {
							lat: Number(latpars),
							lng: Number(lngpars),
							z: Number(zpars)
						}
						return obj;					
					}				
				}
			}		
		}
	}
	// si no consigo hacer el parsing con éxito
	return null;
}
function loc2string(loc) {
	// aquí no hago comprobaciones del objeto loc
	return loc.lat.toFixed(6) + ',' + loc.lng.toFixed(6) + ',' + loc.z + 'z';
}


// la uso para comprobar si cadgrande incluye cadpeq utilizando cadenas normalizadas
function indexOfNormalized(cadgrande, cadpeq) {
	// normalizo cadenas según: https://stackoverflow.com/questions/990904/remove-accents-diacritics-in-a-string-in-javascript
	// adicionalmente las pongo en minúsculas para comparar
	const cgnorm = cadgrande.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
	const cpnorm = cadpeq.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
	return cgnorm.indexOf(cpnorm);
}

function getColor(valor, valormax, colores) {
	if (isNaN(valor))
		return colores[0];
	const ncols = colores.length;
	if (ncols == 0)
		return undefined;
	const delta = valormax / ncols;
	// valores fuera de rango
	if (valor <= 0)
		return colores[0];
	else if (valor >= valormax)
		return colores[ncols -1];
	// uso rangos
	for (let ind=0; ind < ncols; ind++) {
		// devuelvo color si está en el escalón adecuado
		if (valor >= ind*delta && valor < (ind+1)*delta)
			return colores[ind];	
	}
	return undefined;
}

// me baso en la librería mix-css-color
function getColorMix(colores) {
	if (colores.length == 1)
		return colores[0];
	else if (colores.length == 2)
		return mix(colores[0], colores[1], 50).hex;
	else if (colores.length == 3) {
		const caux = mix(colores[0], colores[1], 50).hex;
		return mix(caux, colores[2], 67).hex;
	}
	else if (colores.length == 4) {
		const caux0 = mix(colores[0], colores[1], 50).hex;
		const caux1 = mix(colores[1], colores[2], 50).hex;
		return mix(caux0, caux1, 50).hex;
	}
	return undefined;
}

// cad es una cadena con un prefijo, ej. ifn:Class1
function expandPrefix(cad, prefixes) {
	for (let pr in prefixes) {
		if (cad.startsWith(pr + ':'))
			return cad.replace(pr + ':', prefixes[pr]);
	}
	// no hubo suerte
	return cad;
}

// cad es una cadena expandida, ej. https://datos.iepnb.es/def/sector-publico/medio-ambiente/ifn/Class1
function applyPrefix(cad, prefixes) {
	for (let pr in prefixes) {
		if (cad.startsWith( prefixes[pr]))
			return pr + ':' + cad.replace(prefixes[pr], '');
	}
	// no hubo suerte
	return cad;
}


function getLiteral(litobj, def) {
	// si no está definido el objeto, valor por defecto
	if (litobj == undefined)
		return def;
		
	// 5/3/21 si es un array, convierto a un objeto
	if (Array.isArray(litobj)) {
		let aux = {};
		for (let i=0; i<litobj.length; i++) {
			const el = litobj[i];
			if (typeof el === 'object') {
				// incluyo en aux los pares clave-valor
				const claves = Object.keys(el);
				for (let j=0; j<claves.length; j++) {
					const clave = claves[j];
					aux[clave] = el[clave];				
				}
			}
			else // si no es un objeto, meto directamente el valor con "nolang"
				aux[config.nolang] = el;
		}
		// cambio el objeto a analizar
		litobj = aux;
	} else if (typeof litobj !== 'object') { // y si es un literal lo convierto
		let aux = {}
		aux[config.nolang] = litobj;
		litobj = aux;
	}	
	
	// 2023-11 permito elegir el idioma
	let lang = getPreferredLang();	
	// devuelvo la cadena en el lenguaje elegido si existe
	if (litobj[lang])
		return litobj[lang];
	// en otro caso devuelvo la cadena sin etiqueta de idioma
	if (litobj[config.nolang]) 
		return litobj[config.nolang];
	// pruebo en latín...
	if (litobj['la']) 
		return litobj['la'];
	// cadena por defecto en otro caso...
	if (def)
		return def;	
	// pruebo con el resto de lenguas de la configuración
	for (let ltag of config.langs) {
		if (ltag !== lang && litobj[ltag])
			return litobj[ltag];
	}
	// nada que hacer...
	return undefined;
}
// obtengo lenguaje preferido
function getPreferredLang() {
	//let lang = (typeof Sesion !== 'undefined' && Sesion && Sesion.lang)? Sesion.lang : null;
	let lang = localStorage.getItem('lang');
	if (!lang) {
		// elijo automáticamente a partir del lenguaje del navegador
		const preflangs = window.navigator.languages || [window.navigator.language || window.navigator.userLanguage];
		for (let ltag of preflangs) {
			const langev = ltag.substring(0, 2);
			if (_.contains(config.langs, langev)) {
				lang = langev;
				break;
			}
		}
		if (!lang)
			lang = config.langs[0]; // inglés
	}
	return lang;
}


function uriToLiteral(uri) {
	// extraigo la última parte de la uri
	let lit = "";
	if (uri.split("#").length > 1)
		lit = uri.split("#")[uri.split("#").length -1];
	else {
		lit = uri.split("/")[uri.split("/").length -1];
		if (lit === "")
			lit = uri.split("/")[uri.split("/").length -2];
	}
	// sustituyo - y _ por espacio para que se corten las etiquetas
	lit = lit.replace(/-/g, " "); 
	lit = lit.replace(/_/g, " ");
	return lit;
}

function firstUppercase(lit) {
	if (lit != undefined && lit.length > 0)
		return lit.charAt(0).toUpperCase() + lit.slice(1);
	else
		return lit;
}

function firstLowercase(lit) {
	if (lit != undefined && lit.length > 0)
		return lit.charAt(0).toLowerCase() + lit.slice(1);
	else
		return lit;
}

function getAllSubclasses(curi, target) {
	let curis = [];
	let ituris = [curi];
	while (ituris.length > 0) {
		// meto las uris de la iteración
		curis = _.union(curis, ituris);
		// preparo las uris de la iteración siguiente
		let nituris = [];
		for (let evuri of ituris)
			nituris = _.union(nituris, target[evuri].subclasses);
		// reajusto ituris
		ituris = nituris;
	}
	// quito curi de la lista
	curis = _.without(curis, curi);
	return curis;
}


// https://stackoverflow.com/questions/10420352/converting-file-size-in-bytes-to-human-readable-string/14919494
function humanFileSize(bytes, si=false, dp=1) {
  const thresh = si ? 1000 : 1024;
  
  if (Math.abs(bytes) < thresh) {
    return bytes + ' B';
  }

  const units = si 
    ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'] 
    : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
  let u = -1;
  const r = 10**dp;

  do {
    bytes /= thresh;
    ++u;
  } while (Math.round(Math.abs(bytes) * r) / r >= thresh && u < units.length - 1);


  return bytes.toFixed(dp) + ' ' + units[u];
}


///////////////
// CONFIG MODAL
function configurarModal(opciones, titulo, body, footer) {
	// inicializo el header con el título 	
	let header = '<h1 id="mimodaltitle" class="modal-title fs-5">'+titulo+'</h1>';
	// si hay opciones...
	if (opciones) {
		// tamaño grande o no
		if (opciones.lg)
			$("#mimodalDialog").addClass("modal-lg");
		else
			$("#mimodalDialog").removeClass("modal-lg");
		// centrado vertical o no
		if (opciones.vertcent)
			$("#mimodalDialog").addClass("modal-dialog-centered");
		else		
			$("#mimodalDialog").removeClass("modal-dialog-centered");
		// combino static con la preparación del header
		if (opciones.static) {
			$("#mimodal").attr("data-bs-backdrop", "static");
			$("#mimodal").attr("data-bs-keyboard", false);
		}
		else {
			$("#mimodal").removeAttr("data-bs-backdrop");
			$("#mimodal").removeAttr("data-bs-keyboard");
			header += '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>';	
		}
		// no body?		
		if (opciones.nobody)
			$("#mimodalBody").addClass("d-none");
		else
			$("#mimodalBody").removeClass("d-none");
		// no footer?		
		if (opciones.nofooter)
			$("#mimodalFooter").addClass("d-none");
		else
			$("#mimodalFooter").removeClass("d-none");
		// spinner o no
		if (opciones.spinner) {
			let mibody = '<div class="col-1"> \
						<div class="spinner-border text-secondary" role="status"> \
							<span class="visually-hidden">Loading...</span> \
	  					</div> \
					</div>';
			if (opciones.spinnerMessage)
				mibody += '<div class="col ms-3">'+opciones.spinnerMessage+'</div>';
			// pongo el body
			$("#mimodalBody").html(mibody);
			// y activo bodyrow para alinear el spinner (aunque no esté en las opciones)
			opciones.bodyrow = true;
		}
		// row en el body o no
		if (opciones.bodyrow)
			$("#mimodalBody").addClass("row");
		else
			$("#mimodalBody").removeClass("row");
	}
	// si hay título, pongo el header que he preparado
	if (titulo)
		$("#mimodalHeader").html(header);
	// si hay body...
	if (body) {
		$("#mimodalBody").html(body);
		$("#mimodalBody").removeClass("d-none");
	}
	// si hay footer...
	if (footer) {
		$("#mimodalFooter").html(footer);
		$("#mimodalFooter").removeClass("d-none");
	}
}


export { string2loc, loc2string, getPreferredLang, getLiteral, uriToLiteral, firstUppercase, indexOfNormalized, getAllSubclasses,
	expandPrefix, applyPrefix, getColor, getColorMix, configurarModal };