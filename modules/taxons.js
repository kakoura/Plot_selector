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
import _ from 'underscore';
import Mustache from 'mustache';
import bootstrap from "bootstrap/dist/js/bootstrap.bundle.min.js";

import { Sesion, Datos, cargarURL, obtenerURL } from '../main.js';
import { filtroTaxonesTemplate, coloresTemplate, taxonesSubheadingTemplate, sugeTaxonesTemplate, taxonesBlockTemplate, taxonModalTemplate } from '../data/htmlTemplates.js';
import { getLiteral, uriToLiteral, firstUppercase, indexOfNormalized, configurarModal } from './util.js';
import { renderEntradaLugares } from './places.js';
import { ajustarColorProvincias, ajustarPopupsProvincias } from './provinces.js';
import { ajustarColorTeselas, ajustarPopupsTeselas } from './patches.js';
import { ajustarColorParcelas, ajustarPopupsParcelas } from './plots.js';
import { ajustarColorArboles, ajustarPopupsArboles } from './trees.js';

//////////////////////////////
// FUNCIONES ÚTILES DE TAXONES
function getMoreSpecificTaxon(types) {
	if (types == undefined || types == null)
		return undefined;
	// inicializaciones
	let suri = undefined;
	let nexpuris = null;
	// convierto en array si hace falta
	let arsp = Array.isArray(types)? types : [ types ];
	// evalúo cada uno de los tipos disponibles
	for (let evtype of arsp) {
		if (Datos.taxones[evtype] != undefined && Datos.taxones[evtype].expuris != undefined) {
			// aquí tengo uno válido, miro si es mejor que lo que tenía
			if (nexpuris == null || Datos.taxones[evtype].expuris.length < nexpuris) {
				suri = evtype;
				nexpuris = Datos.taxones[evtype].expuris.length;
			}
		}	
	}
	// devuelvo suri
	return suri;
} 
function numArbsTaxon(narbs, txuri) {
	// obtengo número de árboles por taxón
	let num = 0;
	if (narbs != undefined) {
		const alltxuris = Object.keys(narbs); // obtengo los taxones de la parcela o provincia
		for (let evtxuri of alltxuris) {
			if (txuri === config.treeUri) // en caso de árbol genérico, siempre adentro
				num += narbs[evtxuri];
			else {
				// compruebo si está contenida evtxuri en la lista de especies expandida de txuri
				if ( _.contains(Datos.taxones[txuri].expuris, evtxuri) )
					num += narbs[evtxuri];
			}	
		}
	}
	return num;
}
function sumPropInfoTaxon(infosar, prop, txuri) {
	// obtengo suma de valores de prop para el taxón txuri en el conjunto de infoSpecies
	let sum = 0;
	// analizo cada objeto infoEspecies para hacer el conteo
	for (let is of infosar) {
		// si hay algo en la propiedad continúo
		if (is[prop]) {
			// sumo si coincide con la especie
			if (txuri === config.treeUri) // en caso de árbol genérico, siempre adentro
				sum += getLiteral(is[prop]);
			else {
				if (is.species) {
					// compruebo si la especie del elemento infoEspecies está en la lista de especies expandida de spuri
					if ( _.contains(Datos.taxones[txuri].expuris, is.species))
						sum += getLiteral(is[prop]);
				}
			}
		}
	}
	return sum;
}

////////////////////////////
// HANDLER NOMBRE CIENTÍFICO
function handlerNombreCientifico() {
	// guardo valor (en memoria y en local storage para recordarlo entre sesiones)
	Sesion.nomci = this.checked;
	localStorage.setItem('nomci', Sesion.nomci); // guardará "true" o "false"
	
	// ajusto todos los switches de nombres científicos desactivando
	// los change listeners de manera temporal (gracias, chatGPT)
	$('.nomci').off('change').prop('checked',  Sesion.nomci).on('change', handlerNombreCientifico);
		
	// renderizado taxón (formularios)
	//visualizarTaxonFormulario();
	
	// etiquetas filtros de taxón (panel del mapa)
	visualizarFiltrosTaxon();
		
	// ¡hay que cambiar el valor de todo!
	// cambio las etiquetas de todas las especies en la lista
	$(".taxones_block").find("[spuri]").each(function() {
		// obtengo la especie
		const spuri= $(this).attr("spuri");
		// nombre vulgar y científico
		const nvul = firstUppercase(getLiteral(Datos.taxones[spuri].vulgarName, 
			uriToLiteral(spuri)));
		const ncie = '<i>' + firstUppercase(getLiteral(Datos.taxones[spuri].scientificName,
			nvul)) + '</i>';
		// hago reemplazo en el markup del botón
		const oldmarkup = $(this).html();
		const newmarkup = Sesion.nomci? oldmarkup.replace(nvul, ncie) : oldmarkup.replace(ncie, nvul);
		$(this).html(newmarkup);	
	});
	
	// en teselas actualizo los popups (sólo monte)
	ajustarPopupsTeselas(Object.keys(Sesion.tesPintadas, false));
	
	// en parcelas actualizo los popups
	ajustarPopupsParcelas(Object.keys(Sesion.parPintadas));
	
	// en árboles actualizo los popups
	ajustarPopupsArboles(Object.keys(Sesion.parcarbPintadas));
	
	// en provincias actualizo los popups
	ajustarPopupsProvincias();
	
	/* TODO
	// en el mapa actualizo tooltips ifntrees y popups de edutrees (según el modo edición)
	for (const turi in Sesion.arbsPintados) {
		// ajuste popup según modo edición
		ajustarCursorPopupArbol(turi);
		// tooltip sólo para ifntrees
		if (Datos.arboles[turi].uri) {
			const tooltip = tooltipArbol(Datos.arboles[turi]);
			Sesion.arbsPintados[turi].bindTooltip(tooltip);		
		}
	}*/
}


////////////////////////////////
// VISUALIZACIÓN FILTRO TAXÓN (modo mapa)
// se llama desde cargarURL y desde handlerNombreCientifico
////////////////////////////////
function visualizarFiltrosTaxon() {
	if (Sesion.taxones.length == 0) {
		// escondo el contenido
		$("#filtros_taxon").addClass("d-none");		
	} else {
		// TODO: quito popover que hubiera???
		//$("#bot_info_filtro_taxon").popover('dispose');	
		
		// preparo array con taxones filtrados
		let txfilts = [];
		const colsactivos = Sesion.taxonesColores.slice(0, Sesion.taxones.length);
		for (let ind=0; ind<Sesion.taxones.length; ind++) {
			const tx = Sesion.taxones[ind];		
			const label = Sesion.nomci? 
				'<i>'+firstUppercase(getLiteral(Datos.taxones[tx].scientificName))+'</i>'
				: firstUppercase(getLiteral(Datos.taxones[tx].vulgarName, uriToLiteral(tx)));
			// incluyo colores posibles
			let colores = [];
			const colsno = _.without(colsactivos, Sesion.taxonesColores[ind]);
			const cols = _.difference(config.coltxinds, colsno);
			for (let cind of cols)
				colores.push( {"cind": cind, "label": getLiteral(dict["color"+cind])} );
			const txobj = {
				ind: ind,
				turi: tx,
				textoFiltroTaxon: getLiteral(dict.filtering) +' <strong>' + label + '</strong>',
				color: config.colores[Sesion.taxonesColores[ind]][1],
				colores: colores,
				info: Datos.taxones[tx].wikidata? true : false
			};
			txfilts.push(txobj);
		}
		// hago visible el contenido
		const content = Mustache.render(filtroTaxonesTemplate, txfilts);	
		$("#filtros_taxon").html(content);
		$("#filtros_taxon").removeClass("d-none");
		
		// pongo handlers		
		// quitar filtro de taxón
		$(".quitar_taxon").click(function(event) {  
			// TODO: mando evento de quitar filtro de taxón a GA (sólo si hay filtro activo)
			//if (Sesion.estado.taxon)			
			//	sendEvent( 'select_content', { content_type: 'remove_taxon_filter', content_id: Sesion.estado.taxon } );
						
			// cojo el índice
			const ind = Number($(this).attr("ind"));			
			// elimino el taxón 
			Sesion.taxones.splice(ind, 1);
			// reajusto colores
			const col = Sesion.taxonesColores[ind];
			Sesion.taxonesColores.splice(ind, 1);
			Sesion.taxonesColores.push(col);					
			
			// reajusto URL y la cargo
			history.replaceState(Sesion.estado, "", obtenerURL());
			cargarURL();
		});
		
		// cambio color del filtro de taxón
		$(".color_taxon").click(function() {
			// cojo el índice
			const mind = Number($(this).attr("ind"));
			// cojo el índice del color
			const cind = Number($(this).attr("cind"));
			// reajusto colores
			Sesion.taxonesColores[mind] = cind;
			
			// aquí no puedo recargar la URL porque se bloquea el mapa, así que actualizo las cosas
			
			// cambio el color del filtro de taxón
			$(this).closest('.div_filtro_taxon').css('background-color', config.colores[cind][1]);
			
			// actualizo colores teselas
			const turis = Object.keys(Sesion.tesPintadas);
			ajustarColorTeselas(turis, false);
			
			// actualizo colores parcelas			
			const puris = Object.keys(Sesion.parPintadas);
			ajustarColorParcelas(puris);
			
			// actualizo colores árboles
			const pauris = Object.keys(Sesion.parcarbPintadas);
			ajustarColorArboles(pauris);				
			
			// actualizo colores provincias			
			ajustarColorProvincias();
			
			// actualizo colores posibles
			const colsactivos = Sesion.taxonesColores.slice(0, Sesion.taxones.length);
			for (let ind=0; ind<Sesion.taxones.length; ind++) {
				let htmlCols ='';
				const colsno = _.without(colsactivos, Sesion.taxonesColores[ind]);
				const cols = _.difference(config.coltxinds, colsno);
				//const $pul = $("#ul_colores" + ind);
				for (let i = 0; i < cols.length; i++) {
					const cind = cols[i];
					// preparo etiqueta
					const clab = getLiteral(dict['color'+cind]);
					// obtengo el anchor a actualizar
					const $mia = $("#ul_colores" + ind + " li:eq(" + i + ") a");
					// actualizo cind y la etiqueta
					$mia.attr('cind', cind);
					$mia.html(clab);
				}
			}
		});
		
		// info taxón (de Wikidata)
		$(".info_taxon").click(function() {
			// obtengo uri del taxón
			const turi = $(this).attr("turi");
			
			// objeto taxón
			const taxon = Datos.taxones[turi];
			// preparo objeto del popover
			let popobj = {};
			// imagen
			if (taxon.wikidata.image) {
				popobj.hayimagen = true;
				let imgsaux = Array.isArray(taxon.wikidata.image)? taxon.wikidata.image : [ taxon.wikidata.image ];
				popobj.image = [];
				let first = true;
				for (let img of imgsaux) {
					// ajusto tamaño para que tarde menos en recuperarla
					const imgsrc = (img.startsWith('http://commons.wikimedia.org/wiki/Special:FilePath') && img.indexOf('?') === -1 )?
						img + "?width=300" : img;
					popobj.image.push( { src: imgsrc, active: first})
					first = false;
				}
				if (popobj.image.length == 1)
					popobj.image = popobj.image[0].src;
				else
					popobj.multimages = true;
			}
			// resumen
			if (taxon.wikidata.comment)
				popobj.resumen = getLiteral(taxon.wikidata.comment);
			// nombre científico
			const label = firstUppercase(getLiteral(taxon.vulgarName, uriToLiteral(turi)));
			popobj.nomci = firstUppercase(getLiteral(taxon.scientificName, label));
			// wikidataPage
			if (taxon.wikidata)
				popobj.wikidataPage = taxon.wikidata.iri;
			// wikipediaPage
			if (taxon.wikidata && taxon.wikidata.wikipediaPage)
				popobj.wikipediaPage = taxon.wikidata.wikipediaPage;
			// wikispeciesPage
			if (taxon.wikidata && taxon.wikidata.wikispeciesPage)
				popobj.wikispeciesPage = taxon.wikidata.wikispeciesPage;
			// gbifPage
			if (taxon.wikidata && taxon.wikidata.gbifPage)
				popobj.gbifPage = taxon.wikidata.gbifPage;
			// indico tipo: especie, género, familia o clase
			if (taxon.nivel == 0)
				popobj.tipo = getLiteral(dict.species);
			else if (taxon.nivel == 1)
				popobj.tipo = getLiteral(dict.genus);
			else if (taxon.nivel == 2)
				popobj.tipo = getLiteral(dict.family);
			else if (taxon.nivel == 3)
				popobj.tipo = getLiteral(dict.class);

			// preparo contenido modal
			let tit = '<i>' + popobj.nomci + '</i>';				
			let htmlcontent = Mustache.render(taxonModalTemplate, popobj);
			configurarModal( { lg: true, nofooter: true }, 
				tit, htmlcontent, null);
			// muestro modal
			const mimodal = new bootstrap.Modal(document.getElementById('mimodal'));
			mimodal.show();
			
			/* TODO
			// mando evento de info taxón a GA		
			sendEvent( 'select_content', { content_type: 'infoTaxon', content_id: turi } );*/
		});
	}
}

//////////////////////////
// HANDLER FILTRAR TAXÓN (modo mapa)
function handlerFiltrarTaxon() {
	// obtengo nuevo estado del botón
	const activar = !$("#bot_taxones").hasClass("active");
		
	// pongo el botón activo o no
	if (activar)
		$("#bot_taxones").addClass("active");
	else 
		$("#bot_taxones").removeClass("active");
	
	// render de la selección de taxón
	renderSeleccionTaxon(activar);
}

//////////////////////////
// RENDER SELECCIÓN TAXÓN
function renderSeleccionTaxon(activar, esformulario) {
	// RENDER ENTRADA LUGARES (para que no interfiera)
	if (!esformulario)
		renderEntradaLugares(!activar);
	
	// selecciono los divs apropiados según el modo
	const $divbus = esformulario? $("#taxones_subheading_newtree") : $("#taxones_subheading");
	const $divnav = esformulario? $("#taxones_block_newtree") : $("#taxones_block");

	// BÚSQUEDA CON ENTRADA DE TEXTO Y SUGERENCIAS DE TIPOS DE SITIOS
	if (activar) {
		// rendering del subheading
		const content = Mustache.render(taxonesSubheadingTemplate, {'activar': activar} );
		$divbus.html(content);
		$divbus.removeClass("d-none");
		// handler de buscar taxon...
		$(".in_taxon").on("keyup search", function(e) {
			//console.log("Caracter: " + e.which);
			// trato las teclas de arriba, abajo y enter			
			if (e.which == 13) { // tecla ENTER
				// actúo según el focus
				if (Sesion.txfocus == -1)	{ // ninguna sugerencia seleccionada
					// si hay al menos una sugerencia (y habilitada) voy a la primera
					if ($(".sugetaxones").children(":enabled").length > 0)
						$(".sugetaxones").children(":enabled").eq(0).click();
				}
				else // obtengo la sugerencia y vamos a ella
					$(".sugetaxones").children().eq(Sesion.txfocus).click();
			}
			else if (e.which == 40) { // tecla ABAJO
				// incremento focus
				Sesion.txfocus++;
				ajustarTaxonfocus();
			}
			else if (e.which == 38) { // tecla ARRIBA
				// decremento focus
				Sesion.txfocus--;
				ajustarTaxonfocus();
			}
			else { // caso normal
				const entrada = $(this).val();		
				// analizo la cadena de entrada
				if (entrada.length < 1) { // está vacía: muestro la taxonomía y elimino las sugerencias
					$divnav.removeClass("d-none");
					$(".sugetaxones").html("");
				}
				else {	// hay algo: muestro sugerencias y escondo la taxonomía
					$divnav.addClass("d-none");
					// obtengo sugerencias de tipos de sitios
					const suges = sugeTaxones(entrada);
					// renderizo las sugerencias
					renderSugeTaxones(entrada, suges);
				}
			}
		});
	} 
	else
		$divbus.addClass("d-none");	
	
	// NAVEGACIÓN ONTOLOGÍA DE TIPOS
	if (activar) { // mostrar el bloque de contenido de las especies
		$divnav.removeClass("d-none");
		// ¿caso inicial?
		if ($divnav.html() == "") {
			// preparo datos para mostrar
			let btaxainfo = [];
		
			// analizo los taxones top
			for (const spuri of config.taxonesTop) {
				// obtengo información del objeto para formatear
				let spinfo = getInfoSpecies(spuri);
				// incluyo también el indice
				spinfo.indice = 0;
				spinfo.indentspace = '';				
				// añado el objeto SÓLO SI TIENE INDIVIDUOS
				if (spinfo.allindivs > 0)
					btaxainfo.push(spinfo);
			}
		
			// sort elements
			btaxainfo = _.sortBy(btaxainfo, 'label').reverse();
			btaxainfo = _.sortBy(btaxainfo, function(el) { return (+el.nclasses*100 + +el.allindivs); });
			btaxainfo =	btaxainfo.reverse();
		
			// generate the mark-up
			const content = Mustache.render(taxonesBlockTemplate, btaxainfo);
			
			// pongo el contenido
			$divnav.html(content);			

			// HANDLERS
			// handler de seleccionar taxón
			$(".bot_sel_taxon").click(handlerSeleccionarTaxon);
			// handler de expandir taxón
			$(".bot_expandir_taxon").click(handlerExpandTaxon);
			// handler de showmore
			$(".showmore").click(handlerShowmore);
		}
		else // simplemente mostrar lo que tenía
			$divnav.removeClass("d-none");
	}
	else // esconder el bloque de contenido de los taxones
		$divnav.addClass("d-none");	
}



//////////////////////
// HANDLER SUGERENCIAS
//////////////////////
function sugeTaxones(entrada) {
	let sugerencias = [];
	// sólo actúo si la entrada no es una cadena vacía
	if (entrada.length > 0) {
		// obtengo las uris de los taxones ordenados alfabéticamente
		const txuris = Object.keys(Datos.taxones).sort();
		// evalúo cada especie si vale
		for (let txuri of txuris) {
			// obtengo etiqueta de la especie (por defecto nombre vulgar)
			let labesp = getLiteral(Datos.taxones[txuri].vulgarName, uriToLiteral(txuri));
			// si hay nombre científico...		
			if (Sesion.nomci) {
				labesp = firstUppercase(getLiteral(Datos.taxones[txuri].scientificName,
					labesp));
			}
			// si coincide, a las sugerencias
			if (indexOfNormalized(labesp, entrada) > -1)
				sugerencias.push(txuri);
		}
	}
	return sugerencias;
}
function renderSugeTaxones(entrada, sugerencias) {
	// preparo sugerencias
	let sinfo = {};
	sinfo.sugerencias = [];
		
	// obtengo las sugerencias si la entrada no está vacía
	if (sugerencias.length == 0)
		sinfo.nosugerencias = true;
	else {
		for (let suge of sugerencias) {
			// obtengo información del objeto para formatear
			let spinfo = getInfoSpecies(suge);
			// índice en el que hubo match
			const ind = indexOfNormalized(spinfo.label, entrada);
			// formateo el nombre a mostrar con negritas
			spinfo.labelshown = "";
			if (ind > 0)
				spinfo.labelshown += spinfo.label.substr(0, ind);
			spinfo.labelshown += "<strong>" + spinfo.label.substr(ind, entrada.length) + "</strong>"
			spinfo.labelshown += spinfo.label.substr(ind + entrada.length);			
			// añado el objeto SÓLO SI TIENE INDIVIDUOS
			if (spinfo.allindivs > 0)
				sinfo.sugerencias.push(spinfo);
		}
	}
	
	// ordeno sugerencias por número de individuos y subclases
	sinfo.sugerencias = _.sortBy(sinfo.sugerencias, function(el) { return (+el.nclasses*100 + +el.allindivs); });
	sinfo.sugerencias =	sinfo.sugerencias.reverse();
	
	// corto número de sugerencias
	sinfo.sugerencias = sinfo.sugerencias.slice(0, config.numsugs);
	
	// muestro sugerencias
	const cont = Mustache.render(sugeTaxonesTemplate, sinfo);
	$(".sugetaxones").html(cont);
			
	// handler de los botones de sugerencias
	$(".bot_suge_taxon").click(handlerSeleccionarTaxon);
	
	// inicializo focus
	Sesion.txfocus = -1;
}
function ajustarTaxonfocus() {
	// Sesion.txfocus = 0; => cajetín entrada
	// Sesion.txfocus = i; => num de sugerencia
	// obtengo número de sugerencias que no están deshabilitadas
	const ns = $(".sugetaxones").children(":enabled").length;
	//if (ns == 1 && $("#sugetaxones").children().eq(0)  )// corrección por si no es una sugerencia real
	// reajusto índice del focus si hace falta
	if (ns == 0) Sesion.txfocus = -1;
	else if (Sesion.txfocus >= ns) Sesion.txfocus = 0;
	else if (Sesion.txfocus < 0) Sesion.txfocus = ns -1;
	// y ahora las cosas visuales
	$(".sugetaxones").children().removeClass("active");
	if (Sesion.txfocus >= 0)
		$(".sugetaxones").children().eq(Sesion.txfocus).addClass("active");
}


/////////////////////////////
// HANDLER NAVEGACIÓN TAXONES
/////////////////////////////
function handlerExpandTaxon() {
	// obtengo i para el icono
	let $i = $(this).find("i");
	let $div = $(this).closest(".taxon");
	
	if ($(this).hasClass("active")) { // colapsar
		// desactivo botón
		$(this).removeClass("active");
		// pongo otro icono
		$i.removeClass("bi-chevron-down");
		$i.addClass("bi-chevron-right");
		
		// itero para quitar los elementos de la lista
		const indice = +$div.attr("indice");
		do {
			var $nextdiv = $div.next();
			var fin = true;
			if (+$nextdiv.attr("indice") > indice) {
				$nextdiv.remove();
				fin = false;
			}				
		} while (!fin);
	}
	else { // expandir
		// activo botón
		$(this).addClass("active");
		// pongo otro icono
		$i.removeClass("bi-chevron-right");
		$i.addClass("bi-chevron-down");
		
		// get uri of the class and prepare indentspace
		const spuri = $div.find(".bot_sel_taxon").attr("spuri");
		const newindice = +$div.attr("indice") + 1;
		let indentspace = "";
		for (let ind = 0; ind < newindice; ind++) 
			indentspace += "&nbsp;&nbsp;&nbsp;&nbsp;";
		
		// generate aux object for the template
		let scobj = [];
		_.each(Datos.taxones[spuri].subclasses, function(subspuri) {
			// obtengo información del objeto para formatear
			let subspinfo = getInfoSpecies(subspuri);
			// incluyo también el indent
			subspinfo.indice = newindice;
			subspinfo.indentspace = indentspace;				
			// añado el objeto SÓLO SI TIENE INDIVIDUOS
			if (subspinfo.allindivs > 0)
				scobj.push(subspinfo);
		});
		
		// sort elements
		scobj = _.sortBy(scobj, 'label').reverse();
		scobj = _.sortBy(scobj, function(el) { return (+el.nclasses*100 + +el.allindivs); });
		scobj =	scobj.reverse();
		
		// show more button
		if (scobj.length > config.hidemax) {
			// include fake element for the button
			scobj.splice(config.hidebegin, 0, { "botonesconder" : true, "indice" : newindice, "indentspace" : indentspace+"&nbsp;&nbsp;&nbsp;&nbsp;" });
			for (let ind = config.hidebegin + 1; ind < scobj.length; ind++)
				scobj[ind].esconder = true;						
		}						

		// generate content and add	to the DOM
		const newcontent = Mustache.render(taxonesBlockTemplate, scobj);							
		$div.after(newcontent);
					
		// handler de seleccionar taxón
		$(".bot_sel_taxon").off('click');
		$(".bot_sel_taxon").click(handlerSeleccionarTaxon);
		
		// recreate handlers of the expand/collapse buttons
		$(".bot_expandir_taxon").off('click');
		$(".bot_expandir_taxon").click(handlerExpandTaxon);
		
		// recreate handlers of the showmore buttons
		$(".showmore").click(handlerShowmore);
	}
}
function handlerShowmore() {
	let $div = $(this).closest(".taxon");
	const indice = +$div.attr("indice");
	// show elements
	let $aux = $div;
	let fin;
	do {
		$aux = $aux.next();
		fin = true;
		if (+$aux.attr("indice") == indice && $aux.hasClass("d-none")) {
			$aux.removeClass("d-none");
			$aux.addClass("d-flex");			
			fin = false;
		}
	} while (!fin);	
	// remove show more button
	$div.remove();
}


// para formatear las especies
function getInfoSpecies(spuri) {
	// recupero especie
	const sp = Datos.taxones[spuri];
	// el objeto a devolver
	let spinfo = {};
	// incluyo la uri
	spinfo.uri = spuri;
	// por defecto nombre vulgar
	spinfo.label = firstUppercase(getLiteral(sp.vulgarName, uriToLiteral(spuri)));
	// si hay nombre científico...		
	if (Sesion.nomci) {
		spinfo.nc = true;
		spinfo.label = firstUppercase(getLiteral(sp.scientificName,
			spinfo.label));
	}
	// info número de clases
	spinfo.nclasses = 0;
	for (let suburi of Datos.taxones[spuri].subclasses) {
		if (Datos.taxones[suburi] != undefined && Datos.taxones[suburi].indivs.countALL > 0)
			spinfo.nclasses++;
	}
	if (spinfo.nclasses == 0)
		spinfo.nosubclasses = true;			
	// info individuos
	spinfo.allindivs = sp.indivs.countALL;
	if (spinfo.allindivs > 1000000)
		spinfo.nindivs = "+" + Math.floor(+spinfo.allindivs/1000000) + "M";
	else if (spinfo.allindivs > 1000)
		spinfo.nindivs = "+" + Math.floor(+spinfo.allindivs/1000) + "K";
	else
		spinfo.nindivs = spinfo.allindivs;
	// devuelvo el objeto
	return spinfo;
}



//////////////////////////
// HANDLER SELECCIÓN TAXÓN
//////////////////////////
function handlerSeleccionarTaxon() {
	// obtengo uri del taxon
	const turi = $(this).attr("spuri");
	
	// vamos a la selección del taxón
	tratarSeleccionTaxon(turi);
	
	// click en botón de seleccionar taxón para cerrar el panel correspondiente
	let $bot = $("#bot_taxones");
	/* TODO: no sé si aplicará algo parecido aquí
	if (Sesion.estado.path === 'newtree' || Sesion.estado.path === 'tree')
		$bot = $("#setTreeTaxonEd");*/
	$bot.click();
}
function tratarSeleccionTaxon(turi) {
	// TODO: puede que haya que comprobar que estoy en modo mapa
	
	// compruebo si la tenía
	const inters = _.intersection(Sesion.taxones, [turi]);
	if (inters.length == 0) { // no estaba
		// si supero el número de especies filtradas no permito filtrar más
		if (Sesion.taxones.length >= config.maxTaxonFilters) {
			// aviso con un toast de que hay muchos taxones...
			$("#mitostadaStrong").html(getLiteral(dict.title));
			$("#mitostadaBody").html(getLiteral(dict.tooManyTaxons));
			const tostada = bootstrap.Toast.getOrCreateInstance(document.getElementById('mitostada'));
			tostada.show();
		}
		else { // a guardar				
			// mando evento de filtro de taxón a GA		
			// TODO!!
			//sendEvent( 'select_content', { content_type: 'taxon_filter', content_id: turi } );
	
			// guardo taxón y reajusto URL
			Sesion.taxones.push(turi);
			history.replaceState(Sesion.estado, "", obtenerURL());
			// cargo la URL
			cargarURL();
		
			// visualizo los filtros de taxones (esto ya se hace en cargarURL)
			//visualizarFiltrosTaxon();
		
			/* TODO: ver cómo actualizamos el mapa (!) 
			
			// actualizo el mapa como si lo hubiera movido
			mapaMovido();*/
		}
	}
	else {	// si estaba pongo otro toast
		$("#mitostadaStrong").html(getLiteral(dict.title));
		$("#mitostadaBody").html(getLiteral(dict.taxonAlreadyIncluded));
		const tostada = bootstrap.Toast.getOrCreateInstance(document.getElementById('mitostada'));
		tostada.show();
	}
}

export { getMoreSpecificTaxon, numArbsTaxon, sumPropInfoTaxon, handlerNombreCientifico, handlerFiltrarTaxon, visualizarFiltrosTaxon };