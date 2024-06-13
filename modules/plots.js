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
import { plotPopupTemplate } from '../data/htmlTemplates.js';

import Mustache from 'mustache';
import _ from 'underscore';
import L from './leaflet.circle-sector.js';

import { Sesion, Datos, Layers } from '../main.js';
import { Mimapa } from './map.js';
import { numArbsTaxon, sumPropInfoTaxon } from './taxons.js';
import { getLiteral, uriToLiteral, firstUppercase, getColor, getColorMix, getPreferredLang } from './util.js';



let plotsPolygon={};
let checkedSpecies = {};

const modalContent = document.getElementById('genusInfo');
const selectedSpeciesContainer = document.getElementById('selectedSpecies');
const modal = document.getElementById('myModal');



// colores parcelas
function colorParcela(plot, esBorde) {
	if (esBorde) {
		let color = config.colores[config.colplotind][6]; // color por defecto
		// si hay especies seleccionadas el color puede cambiar
		if (Sesion.taxones.length > 0) {
			// preparo colores a mezclar
			let cols = [];
			for (let ind = 0; ind < Sesion.taxones.length; ind++) {			
				const tx = Sesion.taxones[ind];
				if (numArbsTaxon(plot.ntrees, tx) > 0) {
					const caux = config.colores[Sesion.taxonesColores[ind]][6];
					cols.push(caux);
				}
			}
			if (cols.length == 1) // sólo uno
				color = cols[0];
			else if (cols.length > 1) // toca mezclar
				color = getColorMix(cols);
		}
		return color;
	}
	else { // interior
		let color = config.colores[config.colplotind][0]; // color por defecto
		// si hay especies seleccionadas el color puede cambiar
		if (Sesion.taxones.length > 0) {
			// preparo colores a mezclar
			let cols = [];
			for (let ind = 0; ind < Sesion.taxones.length; ind++) {			
				const tx = Sesion.taxones[ind];
				const natx = numArbsTaxon(plot.ntrees, tx);
				if (natx > 0) {
					const caux = getColor(natx, config.arbsSatParcela, config.colores[Sesion.taxonesColores[ind]]);
					cols.push(caux);
				}
			}
			// resultado de la mezcla
			if (cols.length == 1) // sólo uno
				color = cols[0];
			else if (cols.length > 1) { // toca mezclar
				return cols; // devuelvo un vector con los colores
			}			
		}
		else // sin especie seleccionada
			color = getColor(numArbsTaxon(plot.ntrees, config.treeUri), config.arbsSatParcela, config.colores[config.colplotind]);
			
		return color;
	}
}
function ajustarColorParcelas(puris) {
	let repintar = []; // guardo parcelas a repintar (si cambió el número de segmentos)
	for (let puri of puris) {
		if (Sesion.parPintadas[puri]) {
			const plot = Datos.parcelas[puri];
			const colint = colorParcela(plot, false);
			const colext = colorParcela(plot, true);
			// número de colores
			const newnc = Array.isArray(colint)? colint.length : 1;
			const oldnc = Array.isArray(Sesion.parPintadas[puri])? Sesion.parPintadas[puri].length : 1;
			if (newnc != oldnc) { // toca repintar la parcela...
				// quito lo anterior
				if (oldnc == 1)
					Layers.parcs.removeLayer(Sesion.parPintadas[puri]);
				else {
					for (let ppint of Sesion.parPintadas[puri])
						Layers.parcs.removeLayer(ppint);
				}
				// borro y marco para repintar
				delete Sesion.parPintadas[puri];
				repintar.push(puri);
			}
			else { // sólo cambio el color
				if (newnc == 1) 
					Sesion.parPintadas[puri].setStyle( {fillColor: colint, color: colext} );
				else {
					for (let ind=0; ind<Sesion.parPintadas[puri].length; ind++)
						Sesion.parPintadas[puri][ind].setStyle( {fillColor: colint[ind], color: colext} );
				}
			}	
		}
	}
	// llamo a repintar
	if (repintar.length > 0) 
		pintarParcelas(repintar);
}


// popups parcelas
function popupParcela(plot) {
	// preparo plantilla para el mustache
	// (reutilizo la de provincia de momento)
	let parctemp = {};
	// nombre parcela
	parctemp.plot = getLiteral(dict.plot)+ " " + uriToLiteral(plot.iri);
	// provincia
	if (plot.province)
		parctemp.prov = getLiteral(dict.provinceof) + ' ' + getLiteral(plot.province);	
	// encabezado (especies)
	parctemp.head = [];
	parctemp.head.push('<th scope="col"></th>'); // primera celda del encabezado vacío
	// taxones seleccionados (si los hay)
	for (let tx of Sesion.taxones) {
		let nesp = firstUppercase(getLiteral(Datos.taxones[tx].vulgarName, uriToLiteral(tx)));
		// si hay nombre científico...
		if (Sesion.nomci) {
			nesp = firstUppercase(getLiteral(Datos.taxones[tx].scientificName,	nesp));
			// en cursiva
			nesp = '<i>' + nesp + '</i>';
		}
		parctemp.head.push( '<th scope="col" colspan="2">' + nesp + '</th>' );
	}
	// si no hay taxones seleccionados no pongo tabla
	if (Sesion.taxones.length == 0)
		parctemp.notabla = true;
	// todos los taxones
	parctemp.head.push( '<th scope="col">' + getLiteral(dict.all) + '</th>' );
	// datos
	parctemp.rows = [];
	
	// datos árboles inventario
	const numarbstotal = numArbsTaxon(plot.ntrees, config.treeUri);
	let row = {};
	row.head = getLiteral(dict.treesinv);
	row.els = [];
	for (let tx of Sesion.taxones) {
		let narbsesp = numArbsTaxon(plot.ntrees, tx);
		if (narbsesp > 0) { // si hay árboles...
			const val = Number(narbsesp).toLocaleString(getPreferredLang());
			let valperc = '';
			// pongo porcentaje de la especie si tengo el número de todos los árboles
			if (numarbstotal > 0) {
				const perc = 100 * narbsesp / numarbstotal;
				valperc = ' (' + Number(perc.toFixed(1)).toLocaleString(getPreferredLang()) + '%)';
			}
			row.els.push(val);
			row.els.push(valperc);
		}
		else {
			row.els.push( '' );
			row.els.push( '' );
		}
	}
	// todas las especies
	row.els.push( numarbstotal );
	// incluyo fila
	parctemp.rows.push(row);

	// datos de existencias
	if (plot.infoSpecies) {
		// convierto en array si hace falta para el análisis
		const infosar = Array.isArray(plot.infoSpecies)? plot.infoSpecies : [plot.infoSpecies];	
		// preparo objetos para iterar
		let objs = [];
		objs.push( { "prop" : "numberTrees", "head" : getLiteral(dict.numbertreesHA) } );
		objs.push( { "prop" : "basalArea", "head" : getLiteral(dict.basalareaHA) } );
		objs.push( { "prop" : "volumeWithBark", "head" : getLiteral(dict.volumewithbarkHA) } );
		// itero
		for (let obj of objs) {
			let row = {};
			row.head = obj.head;
			row.els = [];
			// suma total
			let sumtotal = Number(sumPropInfoTaxon(infosar, obj.prop, config.treeUri).toFixed(1));
			// taxones seleccionados (si los hay)
			for (let tx of Sesion.taxones) {
				// obtengo suma de la especies
				let sumesp = Number(sumPropInfoTaxon(infosar, obj.prop, tx).toFixed(1));
				if (sumesp != 0) {
					const val = sumesp.toLocaleString(getPreferredLang());
					let valperc = '';
					// pongo porcentaje
					if (sumtotal > 0) {
						const perc = 100 * sumesp / sumtotal;
						valperc = ' (' + Number(perc.toFixed(1)).toLocaleString(getPreferredLang()) + '%)';				
					}
					row.els.push(val);
					row.els.push(valperc);
				}
				else {
					row.els.push( '' );
					row.els.push( '' );
				}
			}
			// todos los taxones
			row.els.push( sumtotal.toLocaleString(getPreferredLang()) );
			// incluyo fila
			parctemp.rows.push(row);
		}
	}
	
	// obtengo el tooltip y lo devuelvo
	return Mustache.render(plotPopupTemplate, parctemp);
}


function ajustarPopupsParcelas(puris) {
	for (let puri of puris) {
		if (Sesion.parPintadas[puri]) {
			if (Array.isArray(Sesion.parPintadas[puri])) {
				for (let sc of Sesion.parPintadas[puri])
					sc.bindPopup(popupParcela(Datos.parcelas[puri], {maxWidth: 800}));
			}
			else 
				Sesion.parPintadas[puri].bindPopup(popupParcela(Datos.parcelas[puri], {maxWidth: 800}));
		}
	}
}


function pintarParcelas(puris) {
	// pinto las parcelas pendientes
	let plots = [];
	for (let puri of puris) {
		// sólo pintamos si no estaba la parcela en la capa
		if (!Sesion.parPintadas[puri]) {
			const plot = Datos.parcelas[puri];
			const pcentro = L.latLng(plot.lat, plot.lng);
			const colint = colorParcela(plot, false);
			const colext = colorParcela(plot, true);
			// si hay varios colores...
			if (Array.isArray(colint)) {
				// creo un sector circular por color
				const grados = 360/colint.length;
				Sesion.parPintadas[plot.iri] = [];
				for (let ind=0; ind<colint.length; ind++) {
					Sesion.parPintadas[plot.iri].push(
						L.circle(pcentro, {color: colext, weight: 2, fillColor: colint[ind],
								fillOpacity: 0.5, radius: Sesion.radioParPintadas, startAngle: grados*ind, endAngle: grados*(ind+1)})
							.bindPopup(popupParcela(plot), {maxWidth: 800})
							.on('dblclick ', function(e) { Mimapa.setView([plot.lat, plot.lng], config.zArbol + 2); }) // añado aquí también handler de dblclick 	
							.addTo(Layers.parcs)
					);
				}
			}
			else { // sólo un color
				// creo círculo y lo guardo, lo añado al layer group, pongo popup y pongo handler de click en el enlace de ir a parcela			
				Sesion.parPintadas[plot.iri] = L.circle(pcentro, {color: colext, weight: 2, fillColor: colint,
						fillOpacity: 0.5, radius: Sesion.radioParPintadas})
					.bindPopup(popupParcela(plot), {maxWidth: 800})
					.on('dblclick ', function(e) { Mimapa.setView([plot.lat, plot.lng], config.zArbol + 2); }) // añado aquí también handler de dblclick 	
					.addTo(Layers.parcs);				
			}
		}
	}
}

function quitarParcelas() {
	console.info("Borrando capa de parcelas...");
	// borro la capa de parcelas
	Layers.parcs.clearLayers();
	// inicializo la lista de parcelas pintadas
	Sesion.parPintadas = {};	
}




// function displayModal(speciesInfo) {
	
// 	// Calculate genus plot counts

// 	 // Calculate genus plot counts and species
//     let genusSpeciesMap = {};
// 	let genusCounts={};
//     for (const speciesId in speciesInfo) {
//         const genusName = speciesInfo[speciesId][1];
//         const speciesName = speciesInfo[speciesId][0];
// 		const count=speciesInfo[speciesId][2];
        
//         if (!genusSpeciesMap[genusName]) {
//             genusSpeciesMap[genusName] = [];
//         }
        
//         genusSpeciesMap[genusName].push([speciesName,count]);
		
        
//         // Count species
//         // speciesCounts[speciesName] = plotCount;
// 		genusCounts[genusName] = (genusCounts[genusName] || 0) + count;
//     }


// 		// Sort genusSpeciesMap alphabetically by genus names
// 	const sortedGenusNames = Object.keys(genusSpeciesMap).sort();
// 	const sortedGenusSpeciesMap = {};
// 	sortedGenusNames.forEach(genusName => {
// 		sortedGenusSpeciesMap[genusName] = genusSpeciesMap[genusName];
// 	});

// 	genusSpeciesMap=sortedGenusSpeciesMap;

// 	console.log(genusSpeciesMap);

// 			// Create an object to store checked species
	

// 		// Populate modal content
// 	// const modalContent = document.getElementById('genusInfo');
// 	// const selectedSpeciesContainer = document.getElementById('selectedSpecies');
	

// 	for (const genusName in genusSpeciesMap) {
// 		const speciesArray = genusSpeciesMap[genusName];
// 		const genusCount = speciesArray.reduce((acc, curr) => acc + curr[1], 0);

// 		const dropdownContainer = document.createElement('div');
// 		dropdownContainer.classList.add('dropdown-container');

// 		const toggleLabel = document.createElement('div');
// 		toggleLabel.classList.add('toggle-label');
// 		toggleLabel.textContent = `${genusName}: ${genusCount}`;
// 		dropdownContainer.appendChild(toggleLabel);

// 		const dropdownContent = document.createElement('div');
// 		dropdownContent.classList.add('dropdown-content');

// 		dropdownContent.style.display = 'none';

// 		for (const species of speciesArray) {
// 			const speciesItem = document.createElement('div');
			
// 			// Create a label for the species
// 			const label = document.createElement('label');
			
// 			// Create the checkbox
// 			const checkbox = document.createElement('input');
// 			checkbox.type = 'checkbox';
// 			checkbox.value = `${species[0]} (${species[1]})`; // Include count in checkbox value
// 			checkbox.addEventListener('change', function(event) {
// 				if (event.target.checked) {
// 					checkedSpecies[species[0]] = true;
// 					// Create a small box for the checked species
// 					const speciesBox = document.createElement('div');
// 					speciesBox.textContent = `${species[0]} (${species[1]})`;
// 					selectedSpeciesContainer.appendChild(speciesBox);
// 					// Show download button if there are selected species
// 					if (Object.keys(checkedSpecies).length > 0) {
// 						downloadButton.style.display = 'block';
// 					}
// 				} else {
// 					delete checkedSpecies[species[0]];
// 					// Remove the box for the unchecked species
// 					const speciesBoxes = selectedSpeciesContainer.querySelectorAll('div');
// 					speciesBoxes.forEach(box => {
// 						if (box.textContent === `${species[0]} (${species[1]})`) {
// 							box.remove();
// 						}
// 					});
// 					// Hide download button if there are no selected species
// 					if (Object.keys(checkedSpecies).length === 0) {
// 						downloadButton.style.display = 'none';
// 					}
// 				}
// 			});

// 			// Append the checkbox to the label
// 			label.appendChild(checkbox);
// 			// Append the text of the species to the label
// 			label.appendChild(document.createTextNode(`${species[0]} (${species[1]})`));
// 			// Append the label to the species item
// 			speciesItem.appendChild(label);
// 			// Append the species item to the dropdown content
// 			dropdownContent.appendChild(speciesItem);
// 		}

// 		dropdownContainer.appendChild(dropdownContent);
// 		modalContent.appendChild(dropdownContainer);

// 		// Toggle dropdown
// 		toggleLabel.addEventListener('click', function() {
// 			dropdownContent.style.display = dropdownContent.style.display === 'none' ? 'block' : 'none';
// 		});
// 	}

  

// 	// When the user clicks on <span> (x), close the modal
// 	const span = document.getElementsByClassName('close')[0];
// 	span.onclick = function() {
// 	  modal.style.display = 'none';
// 	  modalContent.innerHTML="";
// 	  checkedSpecies={};
// 	  selectedSpeciesContainer.innerHTML="";
// 	}

// 	// Display the modal
// 	// const modal = document.getElementById('myModal');
// 	modal.style.display = 'block';

// }



function plotSpecies(polygonPlots) {
    let speciesCount = {};
	let speciesInfo={}

    for (let plot in polygonPlots) {
        if (Array.isArray(polygonPlots[plot]) && polygonPlots[plot].length > 0) {
            polygonPlots[plot].forEach(plotDetail => {
                // Check if infoSpecies exists and has a species property
                if (plotDetail.infoSpecies && plotDetail.infoSpecies.species) {
                    let speciesUrl = plotDetail.infoSpecies.species;
                    let speciesId = speciesUrl.split('/').pop(); // Extracts the ID as the last segment of the URL

					

                    // Compare speciesId with IDs in Datos.newtaxons
                    for (const genusName in Datos.newtaxons) {
                        const speciesArray = Datos.newtaxons[genusName];
                        for (const [speciesName, speciesID] of speciesArray) {
                            if (speciesID === speciesId) {
                                // Assign speciesName and genusName to plotDetail.infoSpecies
                                plotDetail.infoSpecies.speciesName = speciesName;
                                plotDetail.infoSpecies.speciesGenus = genusName;
								speciesCount[speciesId] = speciesCount[speciesId] ? speciesCount[speciesId] + 1 : 1;

                                // Store species info
                                speciesInfo[speciesId] = [speciesName, genusName, speciesCount[speciesId]];
                                break; // Exit the loop once a match is found
                            }
                        }
                        if (plotDetail.infoSpecies.speciesName && plotDetail.infoSpecies.speciesGenus) {
                            break; // Exit the loop once both speciesName and genusName are assigned
                        }
                    }

                    // // Count each species ID
                    // if (speciesCount[speciesId]) {
                    //     speciesCount[speciesId] += 1; // Increment count if already exists
                    // } else {
                    //     speciesCount[speciesId] = 1; // Initialize count if new
                    // }
                } else {
                    // Handle cases where infoSpecies is undefined or doesn't have a species property
                    console.log("Missing infoSpecies or species property for plot:", plotDetail);
                }
            });
        }
    }

    console.log("Species Info:", speciesInfo);
    console.log("Polygon Plots with Added Entries:", polygonPlots);
	plotsPolygon=polygonPlots;
	setTimeout(()=>{
		displayModal(speciesInfo);
	},800)
	
	
}

export { pintarParcelas, ajustarColorParcelas, ajustarPopupsParcelas, popupParcela, quitarParcelas,plotSpecies };