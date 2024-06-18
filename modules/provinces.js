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
import { provPopupTemplate } from '../data/htmlTemplates.js';

import Mustache from 'mustache';
import _, { all, select } from 'underscore';

import { Sesion, Datos, Layers,Crafts } from '../main.js';
import { Mimapa } from './map.js';
import { numArbsTaxon, sumPropInfoTaxon } from './taxons.js';
import { getLiteral, uriToLiteral, firstUppercase, getColor, getColorMix, getPreferredLang } from './util.js';
import { Layer } from 'leaflet';
import {plotsOfProvince,descomponerCraftsResources} from './dataManager.js';
import { polygonDataDictionary,polygonList } from './mapControls.js';






const selectPlotsbtn=document.getElementById("downloadplots");
const downloadButton = document.getElementById('downloadButton');
const modalContent = document.getElementById('genusInfo');
const selectedSpeciesContainer = document.getElementById('selectedSpecies');
const modal = document.getElementById('myModal');
const totalPlotsDiv = document.getElementById('totalPlots');
const displayDiv = document.getElementById('clickedProvinces');
const uniqueSpan=document.getElementById('unique-template');
// TODO: popups
// TODO: cargar provincias mapa
// TODO: ajustar colores y popups (colores, idioma, nombre científico, loadURL)

// aquí guardo las features de las provincias (ver cargarProvincias)
let featprovs;
let clickedProvinces=[];
let plot_dict ={};
let checkedSpecies = {};
let allPlotsDict={};

function inicializarProvincias() {
	// devuelvo la capa GEOJSON para las provincias
	return L.geoJson(null, {
		style: estiloProvincia,
		onEachFeature: enCadaProvincia
	}).addTo(Mimapa);
}

function cargarProvincias(pintar) {
	if (!Sesion.provsCargadas) { // si ya están cargadas no hay nada que hacer
		if (!featprovs) {
			// preparo los datos en GeoJSON de las provincias
			featprovs = [];
			const pruris = Object.keys(Datos.provs);
			for (let pruri of pruris) {
				let prov = Datos.provs[pruri];
				let prdata = {
					"type": "Feature",
					"properties" : {}
				};
				// sólo incluyo la provincia si hay geometría
				if (prov.geometry) {
					prdata.geometry = prov.geometry;
					prdata.properties = prov;
					// borro redundancia geometrías en properties
					// console.log(prdata.properties);
					delete prdata.properties.geometry;				
					featprovs.push(prdata);				
				}		
			}

		}
		if (pintar) {
			// cargo provincias en la capa
			Layers.provs.addData(featprovs);
			Layers.provs.bringToBack();
			// pongo flag a true
			Sesion.provsCargadas = true;
		}
	}
}

function ajustarColorProvincias() {
	if (Sesion.provsCargadas) {
		for (let prov of featprovs) {
			let layer = _.find(Layers.provs._layers, function(layer) {
				return layer.feature.properties.iri === prov.properties.iri;
			});		
			// reajusto colores
			const colint = (Sesion.estado.mapType === config.mapConfig.mapType[1])?
				config.colores[config.coltesimpind][6] : colorProvincia(prov.properties, false);
			const colext = (Sesion.estado.mapType === config.mapConfig.mapType[1])?
				config.colores[config.coltesimpind][1] : colorProvincia(prov.properties, true);
			layer.setStyle( {fillColor: colint, color: colext} );
		}
	}
}

function ajustarPopupsProvincias() {
	if (Sesion.provsCargadas) {
		for (let prov of featprovs) {
			const layer = _.find(Layers.provs._layers, function(layer) {
				return layer.feature.properties.iri === prov.properties.iri;
			});		
			// reajusto popup
			layer.bindPopup(popupProvincia(prov), {maxWidth: 800});
		}
	}
}

// ESTILOS PROVINCIAS
// preparo estilo polígonos
function estiloProvincia(prov) {
	if (Sesion.estado.mapType === config.mapConfig.mapType[1]) // capa satélite
	    return {
			fillColor: config.colores[config.coltesimpind][6], // color de relleno  
			weight: 1.5,
			opacity: 1,
			color: config.colores[config.coltesimpind][1],
			dashArray: '1',
			fillOpacity: 0.1
		};
	else 
	    return {
			fillColor: colorProvincia(prov.properties, false), // color de relleno  
			weight: 1,//2,
			opacity: 1,
			color: colorProvincia(prov.properties, true),
			dashArray: '1',
			fillOpacity: 0.3 //0.4
		};
}
function realceProvincia(e) {
	if (Sesion.zoom >= config.zParcela)
		return; // no hay realce cuando el zoom es muy grande
    const layer = e.target;
	if (Sesion.estado.mapType === config.mapConfig.mapType[1]) // capa satélite
		layer.setStyle({
			weight: 3,
			dashArray: '',
			fillOpacity: 0.2
		});	
	else
		layer.setStyle({	
			weight: 2,
			dashArray: '',
			fillOpacity: 0.4
		});
}
function quitarRealceProvincia(e) {
    let layer = e.target;
	
	console.log(Layers.provs)
    if (e.type === "popupclose" || !(layer.getPopup() && layer.getPopup().isOpen()))
		// layer.closePopup();    
		Layers.provs.resetStyle(layer);
	// previo
    //Provs.resetStyle(e.target);
}/*
function zoomProvincia(e) {
	Map.fitBounds(e.target.getBounds());
	L.DomEvent.stopPropagation(e); // para que el mapa no haga doubleClickZoom 
}*/

function closeProvinces(layer){
	layer.closePopup()
}

function enCadaProvincia(feature, layer) {
	// pongo popup

	layer.bindPopup(popupProvincia(feature), {maxWidth: 800})
		.on({
			popupopen: realceProvincia,
			popupclose: closeProvinces(layer)
		});

		/*
	// eventos de realce y zoom
    layer.on({
        mouseover: realceProvincia,
        mouseout: quitarRealceProvincia
		//dblclick: zoomProvincia 
    });
	*/

	layer.on('click', async function(e) {
		let numPlots = feature.properties.nallplots || 0;
		let provinceName;
		
		const span = document.getElementsByClassName('close')[0];
		span.addEventListener('click', function() {
			layer.setStyle({
				fillColor: colorProvincia(layer.feature.properties, false), // color de relleno  
				weight: 1,//2,
				opacity: 1,
				color: colorProvincia(layer.feature.properties, true),
				dashArray: '1',
				fillOpacity: 0.3 //0.4
			});
			layer.closePopup();
		});
		
		downloadButton.addEventListener('click', function() {
			layer.setStyle({
				fillColor: colorProvincia(layer.feature.properties, false), // color de relleno  
				weight: 1,//2,
				opacity: 1,
				color: colorProvincia(layer.feature.properties, true),
				dashArray: '1',
				fillOpacity: 0.3 //0.4
			});
			layer.closePopup();
		});

		provinceName = getLiteral(feature.properties.label);
		// const pltsProv = await plotsOfProvince(layer,provinceName);
		plot_dict[provinceName] = layer;

		layer.setStyle({
			fillColor: 'darkgreen',
            color: 'black'
        });

		if (!clickedProvinces.some(([name]) => name === provinceName)) {
            // Add the province name to the display div

            
            const provinceDiv = document.createElement('div');
		
            provinceDiv.textContent = provinceName;
			provinceDiv.className = 'province-item';
            displayDiv.appendChild(provinceDiv);
            // Create a button to unclick the province
            const unclickButton = document.createElement('button');
			unclickButton.className = 'unclick-button';
            unclickButton.textContent = 'X';

            unclickButton.addEventListener('click', function(e) {
                // Remove the clicked province from the display div and the clickedProvinces array
                displayDiv.removeChild(provinceDiv);
				delete plot_dict[provinceName]
				console.log(plot_dict);
				const provinceIndex = clickedProvinces.findIndex(([name]) => name === provinceName);
            	clickedProvinces.splice(provinceIndex, 1);
				// Update the total number of plots displayed
				updateTotalPlots();
				// console.log(clickedProvinces);
           	
				//let removableLayer = clickedLayers.find(l => getLiteral(l.feature.properties.label) === provinceName);
                
				if(layer.getPopup().isOpen()){
					closeProvinces(layer)
				}
				
				layer.setStyle({
					fillColor: colorProvincia(layer.feature.properties, false), // color de relleno  
					weight: 1,//2,
					opacity: 1,
					color: colorProvincia(layer.feature.properties, true),
					dashArray: '1',
					fillOpacity: 0.3 //0.4
				});
			});
            // Append the unclick button to the province div
            provinceDiv.appendChild(unclickButton);

			clickedProvinces.push([provinceName,numPlots]);
			// Update the total number of plots displayed
			updateTotalPlots();
            // Add the province to the clickedProvinces array
        }
	});
}




function calculateTotalPlots() {
    let totalPlots = 0;
    clickedProvinces.forEach(function([_, numPlots]) {
        totalPlots += numPlots;
    });
    return totalPlots;
}

// Function to update the total number of plots displayed
function updateTotalPlots() {
	// const downloadbtn = document.getElementById('downloadplots');
	if (clickedProvinces.length==0){
		totalPlotsDiv.style.opacity=0;
		selectPlotsbtn.style.opacity=0;
	} 
	else{
		totalPlotsDiv.innerHTML = `<p class="fw-bold fs-5">Total Plots: ${calculateTotalPlots()}</p>`;
		totalPlotsDiv.classList.add('bg-primary', 'text-light', 'p-1', 'rounded');
		totalPlotsDiv.style.opacity=1;
		selectPlotsbtn.style.opacity=1;

	}
}

function displayModal(speciesInfo,totalPlots) {
	// Calculate species plot counts
	let speciesMap = {};
	// checkedSpecies={};
    for (const speciesId in speciesInfo) {
        const speciesName = speciesInfo[speciesId][0];
		const count = speciesInfo[speciesId][2];
        
        speciesMap[speciesName] = (speciesMap[speciesName] || 0) + count;
    }

	// if (Object.keys(checkedSpecies).length === 0) {
	// 	downloadButton.style.display = 'none';
	// }

	// Sort speciesMap alphabetically by species names
	const sortedSpeciesNames = Object.keys(speciesMap).sort();
	const sortedSpeciesMap = {};
	sortedSpeciesNames.forEach(speciesName => {
		sortedSpeciesMap[speciesName] = speciesMap[speciesName];
	});

	speciesMap = sortedSpeciesMap;

	console.log('RAR:',speciesMap);
	 // Calculate unique count
	// Calculate unique count
	// let uniqueCount = 0;
	// for (let specie in speciesMap) {
	// 	uniqueCount += speciesMap[specie];
	// }

	// Update only the unique count
	const uniqueCountSpan = document.getElementById('unique-count');
	uniqueCountSpan.innerHTML = totalPlots;

	// Create an object to store checked species
	// let checkedSpecies = {};

	// Populate modal content
	const modalContent = document.getElementById('genusInfo');
	const selectedSpeciesContainer = document.getElementById('selectedSpecies');

	for (const speciesName in speciesMap) {
		const count = speciesMap[speciesName];

		const speciesItem = document.createElement('div');
		
		// Create a label for the species
		const label = document.createElement('label');
		
		// Create the checkbox
		const checkbox = document.createElement('input');
		checkbox.type = 'checkbox';
		checkbox.value = `${speciesName} (${count})`; // Include count in checkbox value
		checkbox.addEventListener('change', function(event) {
			if (event.target.checked) {
				checkedSpecies[speciesName] = true;
				console.log(checkedSpecies);
				// Create a small box for the checked species
				const speciesBox = document.createElement('div');
				speciesBox.textContent = `${speciesName} (${count})`;
				selectedSpeciesContainer.appendChild(speciesBox);
				// Show download button if there are selected species
				if (Object.keys(checkedSpecies).length > 0) {
					downloadButton.style.display = 'block';
				}
			} else {
				delete checkedSpecies[speciesName];
				// Remove the box for the unchecked species
				const speciesBoxes = selectedSpeciesContainer.querySelectorAll('div');
				speciesBoxes.forEach(box => {
					if (box.textContent === `${speciesName} (${count})`) {
						box.remove();
					}
				});
				// Hide download button if there are no selected species
				if (Object.keys(checkedSpecies).length === 0) {
					downloadButton.style.display = 'none';
				}
			}
		});

		// Create a custom checkbox
		const checkboxCustom = document.createElement('span');

		// Append the checkbox and custom checkbox to the label
		label.appendChild(checkbox);
		label.appendChild(checkboxCustom);
		// Append the text of the species to the label
		label.appendChild(document.createTextNode(`${speciesName} (${count})`));
		// Append the label to the species item
		speciesItem.appendChild(label);
		// Append the species item to the modal content
		modalContent.appendChild(speciesItem);
	}

	// When the user clicks on <span> (x), close the modal
	const span = document.getElementsByClassName('close')[0];
	span.onclick = function() {
	 	modal.style.display = 'none';
		modalContent.innerHTML="";
		checkedSpecies={};
		selectedSpeciesContainer.innerHTML="";
		Layers.editableLayer.clearLayers();
		totalPlotsDiv.style.opacity=0;
		selectPlotsbtn.style.opacity=0;
		clickedProvinces=[];
		totalPlotsDiv.innerHTML="";
		displayDiv.innerHTML="";
		plot_dict ={};
		allPlotsDict={};
		polygonList.length=0;
		// downloadButton.style.display="none";
		
		for (let polygon in polygonDataDictionary){
			delete polygonDataDictionary[polygon];
		}
		
	}

	// Display the modal
	const modal = document.getElementById('myModal');
	modal.style.display = 'block';
}




selectPlotsbtn.addEventListener('click', async () => {
    const loadingOverlay = document.getElementById('loadingOverlay');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');

    loadingOverlay.style.display = 'block'; // Show the loading overlay

    let data_dictionary = {};
    const totalProvinces = Object.keys(plot_dict).length;
    let loadedProvinces = 0;

    for (const name in plot_dict) {
        const pltsProv = await plotsOfProvince(plot_dict[name], name);
        data_dictionary[name] = pltsProv;

        // Update progress bar
        loadedProvinces++;
        const progressPercentage = (loadedProvinces / totalProvinces) * 100;
        progressBar.style.width = progressPercentage + '%';
        progressText.textContent = `${Math.round(progressPercentage)}%`;
    }
	
    console.log("Provinces Dictionary",data_dictionary);
	console.log("Polygon Dictionary",polygonDataDictionary);

	
	allPlotsDict = Object.assign({}, data_dictionary,polygonDataDictionary);
	console.log("Plots before",allPlotsDict);
	allPlotsDict = removeDuplicatesAndUpdatePlots(allPlotsDict);

	console.log("Plots after",allPlotsDict);

	let speciesCount = {};
	let speciesInfo = {};
	let countUniquePlots=0;
	let missingInfo={};



	for (let province in allPlotsDict) {
		let provinceData = allPlotsDict[province];
		for (let plotKey in provinceData) {
			if (plotKey.startsWith('plot')) { // Ensure it's a plot key
				let plotArray = provinceData[plotKey];
				if (plotArray && plotArray.length > 0) {
					let plotDetail = plotArray[0]; // Assuming there is always at least one plot detail object in the array
					if (plotDetail.uniqueSpecies && plotDetail.uniqueSpecies.length > 0) {
						plotDetail.infoSpeciesList = []; // Create a new array to store species info

						for (let speciesUrl of plotDetail.uniqueSpecies) {
							let speciesId = speciesUrl.split('/').pop(); // Extracts the ID as the last segment of the URL

							for (const genusName in Datos.newtaxons) {
								const speciesArray = Datos.newtaxons[genusName];
								for (const [speciesName, speciesID] of speciesArray) {
									if (speciesID === speciesId) {
										// Create a species detail object
										let speciesDetail = {
											speciesID: speciesId,
											speciesName: speciesName,
											speciesGenus: genusName
										};
										// Push the species detail into the infoSpeciesList array
										plotDetail.infoSpeciesList.push(speciesDetail);

										// Increment the species count
										speciesCount[speciesId] = speciesCount[speciesId] ? speciesCount[speciesId] + 1 : 1;

										// Store species info
										speciesInfo[speciesId] = [speciesName, genusName, speciesCount[speciesId]];
										break; // Exit the loop once a match is found
									}
								}
								if (plotDetail.infoSpeciesList.some(species => species.speciesID === speciesId)) {
									break; // Exit the loop once a match is found
								}
							}
						}
					} else {
						// console.log("Missing uniqueSpecies property for plot:", plotKey);
						// console.log(allPlotsDict[province][plotKey]);
						missingInfo[plotKey]=plotArray
						delete allPlotsDict[province][plotKey];
						countUniquePlots++;

					}
				} else {
					console.log("No plots or empty plot array for key:", plotKey);
				}
			}
		}
	}

	let totalPlots=0
	for (const area in allPlotsDict){
		totalPlots+=allPlotsDict[area].NumberOfPlots
	}
	totalPlots=totalPlots-countUniquePlots
	// console.log(totalPlots);
	console.log("Species Info:", speciesInfo);
	console.log("Dictionary with added Entries: ",allPlotsDict);
	console.log("Missing Info for plots",missingInfo);
// Assuming dataDictionary and speciesDetails are already defined



    // Hide the loading overlay when all provinces are loaded
	setTimeout(()=>{
		loadingOverlay.style.display = 'none';
		progressText.textContent='0%';
		progressBar.style.width='0%';
	},600)

	displayModal(speciesInfo,totalPlots);



	
    
});

function removeDuplicatesAndUpdatePlots(polygonDataDictionary) {
    const seenPlots = new Set();
    const newPolygonDataDictionary = {};

    // Iterate over each polygon in the dictionary
    for (const polygonKey in polygonDataDictionary) {
        if (polygonDataDictionary.hasOwnProperty(polygonKey)) {
            const polygon = polygonDataDictionary[polygonKey];
            const newPolygon = { NumberOfPlots: 0 };

            // Iterate over each plot in the polygon
            for (const plotKey in polygon) {
                if (plotKey !== 'NumberOfPlots' && polygon.hasOwnProperty(plotKey)) {
                    if (!seenPlots.has(plotKey)) {
                        seenPlots.add(plotKey);
                        newPolygon[plotKey] = polygon[plotKey];
                        newPolygon.NumberOfPlots++;
                    }
                }
            }

            newPolygonDataDictionary[polygonKey] = newPolygon;
        }
    }

    return newPolygonDataDictionary;
}


// Add click event listener to download button
downloadButton.addEventListener('click', function() {
    // Filter plots based on checked species
    const filteredPlots = {};
	console.log("CheckedSpecies",checkedSpecies);
    for (const chip in allPlotsDict) {
        console.log(chip);

        for (const plotKey in allPlotsDict[chip]) {
            const plotData = allPlotsDict[chip][plotKey];
            // Initialize a flag to indicate if any matching species is found
            let hasMatchingSpecies = false;
            
            // Iterate over each plot detail in plotData
            for (const plotDetailKey in plotData) {
                const plotDetail = plotData[plotDetailKey];
                
                // Check if infoSpeciesList exists
                if (plotDetail.infoSpeciesList && plotDetail.infoSpeciesList.length > 0) {
                    // Check each species in the infoSpeciesList
                    for (const speciesDetail of plotDetail.infoSpeciesList) {
                        if (checkedSpecies[speciesDetail.speciesName]) {
                            hasMatchingSpecies = true;
                            console.log(`Matching species found: ${speciesDetail.speciesName}`);
                            break; // Exit the loop once a matching species is found
                        }
                    }
                } else {
                    console.log("Missing infoSpeciesList property for plot:", plotKey);
                }
                
                if (hasMatchingSpecies) {
                    break; // Exit the loop if a matching species is found
                }
            }
            
            // If any matching species is found, add the plot to filteredPlots
            if (hasMatchingSpecies) {
                if (!filteredPlots[chip]) {
                    filteredPlots[chip] = {};
                }
                filteredPlots[chip][plotKey] = plotData;
            }
        }
    }

    

    // Print the filtered plots
    console.log("Filtered Plots:", filteredPlots);
	let idDictionary = [];

	// // // Iterate over each area in the filteredPlots object
	// for (let area in filteredPlots) {
	// 	// Initialize the area in idDictionary
		
	// 	// Iterate over each plot in the area
	// 	for (let plot in filteredPlots[area]) {
	// 		const plotId = plot.split('_')[1];
	// 		// Access the namespace from the first entry of the plot array
	// 		const ns = filteredPlots[area][plot][0].ns;
	// 		// Concatenate the namespace with the extracted plot ID
	// 		const fullPlotId = ns + plotId;
	// 		// Add the full plot ID to the dictionary
	// 		idDictionary.push(fullPlotId);
	// 	}
	// }

// Print the idDictionary to check the results
	// console.log("ID Dictionary:", idDictionary);
	// const objrs = descomponerCraftsResources('PlotInfo', idDictionary);
	// console.log(objrs);
	// let totalInfo=[];
	// let promesas=[];

	// for (let objr of objrs) {
    //     //  a promise for each API request
    //     promesas.push( new Promise(async function(resolve, reject) {
    //         try {
    //             // call to the datastore
    //             let datos = await Crafts.getALLData(config.craftsALL.resourceTemplate, objr);

    //             // process the results
	// 			totalInfo.push(datos)

    //             // resolve the promis
    //             resolve(true);
    //         } catch(err) {
    //             reject(err);
    //         }
    //     }) );
    // }
	// console.log(totalInfo);
	
	// // Convert filteredPlots to JSON string
	// const filteredPlotsJSON = JSON.stringify(filteredPlots, null, 2);

	// // Create a Blob containing the JSON data
	// const blob = new Blob([filteredPlotsJSON], { type: 'application/json' });

	// // Create a temporary link element
	// const link = document.createElement('a');
	// link.href = URL.createObjectURL(blob);

	// // Generate the base filename
	// let filename = 'plots';

	// // Check if the file already exists in the directory
	// const files = Object.keys(localStorage);
	// let fileExists = false;
	// let count = 1;
	// while (files.includes(`${filename}.json`)) {
	// 	// If the file already exists, increment the count and update the filename
	// 	filename = `plots (${count})`;
	// 	count++;
	// 	fileExists = true;
	// }

	// // Set the download attribute to the updated filename
	// link.setAttribute('download', `${filename}.json`);

	// // Append the link to the document body
	// document.body.appendChild(link);

	// // Trigger a click event on the link to initiate the download
	// link.click();

	// // Remove the link from the document body
	// document.body.removeChild(link);

	

	//Reset the attributes	
	modal.style.display = 'none';
	modalContent.innerHTML="";
	checkedSpecies={};
	selectedSpeciesContainer.innerHTML="";
	Layers.editableLayer.clearLayers();
	totalPlotsDiv.style.opacity=0;
	selectPlotsbtn.style.opacity=0;
	clickedProvinces=[];
	totalPlotsDiv.innerHTML="";
	displayDiv.innerHTML="";
	plot_dict ={};
	allPlotsDict={};
	polygonList.length=0;

	for (let polygon in polygonDataDictionary){
		delete polygonDataDictionary[polygon];
	}


});


function popupProvincia(feature) {

    let prprops = feature.properties;

    // preparo plantilla para el mustache
    let prtemp = {};
    prtemp.prov = getLiteral(feature.properties.label); // etiqueta con el nombre

    // incluyo tipo (español o portugués)
    prtemp.type = feature.properties.isPortuguese ? getLiteral(dict.portugueseRegion) : getLiteral(dict.spanishProvince);

    // Aseguro que haya al menos una fila para el número total de parcelas
    prtemp.rows = [];
    let row = {};
    row.head = getLiteral(dict.plotsinv);
    row.els = [];
    if (prprops.nallplots !== undefined) {
        row.els.push(Number(prprops.nallplots).toLocaleString(getPreferredLang())); // número total de parcelas si está disponible
    } else {
        row.els.push('No data'); // Si no hay datos, muestra un mensaje indicando que no hay información
    }
    prtemp.rows.push(row);

    // obtengo el tooltip y lo devuelvo
    return Mustache.render(provPopupTemplate, prtemp);
}

function colorProvincia(prprops, esBorde) {
	// 2021-05-24 cambio en la manera de obtener el color, ahora me baso en infospecies para incluir a Portugal
	let infosar = null;
	if (prprops.infoSpecies)
		infosar = Array.isArray(prprops.infoSpecies)? prprops.infoSpecies : [prprops.infoSpecies];
	if (esBorde) {
		let color = config.colores[config.colplotind][4]; // color por defecto
		// si hay taxones seleccionados el color puede cambiar
		if (Sesion.taxones.length > 0) {
			// preparo colores a mezclar
			let cols = [];
			for (let ind = 0; ind < Sesion.taxones.length; ind++) {
				if (infosar != null && sumPropInfoTaxon(infosar, "numberTrees", Sesion.taxones[ind]) > 0) {
					const caux = config.colores[Sesion.taxonesColores[ind]][4];
					cols.push(caux);
				}
			}
			// si hay algún color...
			if (cols.length > 0)
				color = getColorMix(cols);
		}
		return color;
	}
	else { // interior
		let color = config.colores[config.colplotind][0]; // color por defecto
		// si hay taxones seleccionados el color puede cambiar
		if (Sesion.taxones.length > 0) {
			// preparo colores a mezclar
			let cols = [];
			for (let ind = 0; ind < Sesion.taxones.length; ind++) {
				if (infosar && sumPropInfoTaxon(infosar, "numberTrees", Sesion.taxones[ind]) > 0) {
					// obtengo máximo de árboles de la especie en cuestión		
					const lntrees = _.map(featprovs, function(ft) {
						let num = 0;
						if (ft.properties.infoSpecies) {
							const isar = Array.isArray(ft.properties.infoSpecies)? ft.properties.infoSpecies : [ft.properties.infoSpecies];
							num = sumPropInfoTaxon(isar, "numberTrees", Sesion.taxones[ind]);
						}					
						return num; 
					});
					const ntreesmax = _.max(lntrees);
					// obtengo color y guardo
					const caux = getColor(sumPropInfoTaxon(infosar, "numberTrees", Sesion.taxones[ind]), ntreesmax, config.colores[Sesion.taxonesColores[ind]]);
					cols.push(caux);
				}
			}
			// si hay algún color...
			if (cols.length > 0)
				color = getColorMix(cols);		
		}
		else { // sin especie seleccionada
			if (infosar && sumPropInfoTaxon(infosar, "numberTrees", config.treeUri) > 0) {
				// obtengo máximo de árboles
				const lntrees = _.map(featprovs, function(ft) {
					let num = 0;
					if (ft.properties.infoSpecies) {
						const isar = Array.isArray(ft.properties.infoSpecies)? ft.properties.infoSpecies : [ft.properties.infoSpecies];
						num = sumPropInfoTaxon(isar, "numberTrees", config.treeUri);
					}					
					return num; 
				});
				const ntreesmax = _.max(lntrees);
				color = getColor(sumPropInfoTaxon(infosar, "numberTrees", config.treeUri), ntreesmax, config.colores[config.colplotind]);
			}
		}		
		return color;
	}
}

function quitarProvincias() {
	// quito capa de provincias
	Layers.provs.clearLayers();
	Layers.provs.bringToBack();
	// pongo flag a falso
	Sesion.provsCargadas = false;
}

export { clickedProvinces, featprovs, inicializarProvincias, cargarProvincias, ajustarColorProvincias, ajustarPopupsProvincias, quitarProvincias, updateTotalPlots, calculateTotalPlots};