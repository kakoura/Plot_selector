import $ from "jquery";
import config from '../data/config.json';
import {Sesion, Layers} from "../main";
import {Mustache} from 'mustache'
import { getLiteral, configurarModal } from "./util";
import { downloadTemplateBody } from "../data/htmlTemplates";
import { getGrid, getGridBounds } from './grid.js';
import { Crafts } from "../main";
import { descomponerCraftsResources } from "./dataManager.js";

function prepararDescarga() {
	// obtengo zoom del mapa
    console.log(Sesion.zoom)
	const zoomCelda = Sesion.zoom > config.zMaxCelda? config.zMaxCelda : Sesion.zoom;
    console.log(zoomCelda);
	// obtengo grid a partir del polígono
	if (Layers.editableLayer.getLayers().length == 0)
		return; // nada que hacer	
	const polygon = Layers.editableLayer.getLayers()[0]; // sólo debería haber un polígono
	const grid = getGrid(polygon.getBounds(), zoomCelda);
	
    // console.log(grid);
	// preparo objeto plantilla para el modal
	const gridBounds = getGridBounds(grid, zoomCelda);
	const tobjbody = {
		zoom: zoomCelda,
		plotsAvailable: zoomCelda >= config.zParcela
	};
	
	// // inicialización modal con petición de confirmación
	// const htmlbody = Mustache.render(downloadTemplateBody, tobjbody);
	// configurarModal( { static: true, vertcent: true}, 
	// 	getLiteral(dict.downloadData), htmlbody, footerDescargaDatos);		
	// // muestro el modal
	// const mimodal = new bootstrap.Modal(document.getElementById('mimodal'));
	// mimodal.show();
	
	// // listener al modal para que borre el polígono al cerrar
	// document.getElementById('mimodal').addEventListener('hidden.bs.modal', event => {
 	// 	Layers.editableLayer.clearLayers();
	// });
	
	// // pongo listener a los checks de descarga para mensajillo y para habilitar el botón de descarga
	// $('.check-download').on('change', function() {
	// 	const alguncheck = $('.check-download').is(':checked');
	// 	if (alguncheck) {
	// 		$('#downloadNothing').addClass("d-none");
	// 		const algunradio = $('.downloadRadio').is(':checked');
	// 		$('#downloadData').prop('disabled', !algunradio);
	// 	}
	// 	else {
	// 		$('#downloadNothing').removeClass("d-none");
	// 		$('#downloadData').prop('disabled', true);
	// 	}
	// });
	
	// // pongo listener al radio para habilitar el botón de descarga
	// $('.downloadRadio').on('change', function() {	
	// 	$('#downloadNoFormat').addClass("d-none");
	// 	const alguncheck = $('.check-download').is(':checked');
	// 	if (alguncheck)
	// 		$('#downloadData').prop('disabled', false);
	// });
	
	// // listener al botón de descarga
	// $('#downloadData').click(function() {
	// 	// miro qué cosas quiere descargar
	// 	let cosasDescargar = {
	// 		plots: $('#checkPlots').is(':checked'),
	// 		trees: $('#checkTrees').is(':checked'),
	// 		regions: $('#checkRegions').is(':checked'),
	// 		patches: $('#checkPatches').is(':checked')
	// 	};	
	// 	// detecto el formato de descarga y preparo nombre del fichero
	// 	let format = "GeoJSON"; // valor por defecto
	// 	if ($('#CSV').is(':checked'))
	// 		format = "CSV";
	// 	// llamo a descargar los datos
	// 	// descargarDatos(cosasDescargar, grid, zoomCelda, format, polygon);
	// });
}

async function downloadDataPol(polygonBounds){

	let plots,data_info,flattenedInfoOfPlots;


	// const loadingOverlay = document.getElementById('loadingOverlay');
    // const progressBar = document.getElementById('progressBar');
    // const progressText = document.getElementById('progressText');

    // loadingOverlay.style.display = 'block'; // Show the loading overlay

	// Extract bounds from the drawn polygon
    const northEast = polygonBounds.getNorthEast(); // Get the northeastern corner
    const southWest = polygonBounds.getSouthWest(); // Get the southwestern corner

    const north = northEast.lat; // Latitude of the northern point
    const east = northEast.lng; // Longitude of the eastern point
    const south = southWest.lat; // Latitude of the southern point
    const west = southWest.lng; // Longitude of the western point

	console.log(polygonBounds);

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
	let totalPlots=[];
	// hago la llamada a CRAFTS	y espero resultados

	const loadingOverlay = document.getElementById('loadingOverlay');
	const progressBar = document.getElementById('progressBar');
	const progressText = document.getElementById('progressText');

	loadingOverlay.style.display = 'block'; // Show the loading overlay


	do{
		qobj.offset = indpag * qobj.limit;

		const datos = await Crafts.getData(config.craftsConfig.queryPlotsinbox, qobj);
				// console.lo

				// Extract the results from the datos object
		// console.log(datos);
		const results = datos.results.bindings;



		// console.log(results);
		// Extract the coordinates of the plots
		plots = results.map(result => ({
			name: result.plot.value,
			latitude: parseFloat(result.lat.value),
			longitude: parseFloat(result.lng.value)
		}));

		totalPlots.push(plots);
		// console.log(plots);
		
	
		maspags = !(datos.results.bindings.length < qobj.limit);
		// incremento el índice
		indpag++;

		// // Update loading bar progress
		// const progressPercentage = (indpag / totalPlots.length) * 100;
		// progressBar.style.width = progressPercentage + '%';
        // progressText.textContent = `${Math.round(progressPercentage)}%`;

	}while(maspags);// detecto si hay más páginas

	totalPlots=totalPlots.flat();
	console.log(totalPlots);

	// // Hide the loading overlay when all provinces are loaded
	// setTimeout(()=>{
	// 	// loadingOverlay.style.display = 'none';
	// 	progressText.textContent='0%';
	// 	progressBar.style.width='0%';
	// },100)


	//GET INFO FOR FILTERED PLOTS
	const PlotNames = totalPlots.map(plot => plot.name);

	// console.log("Filtered Plot Names:", filteredPlotNames);
	const objrs = descomponerCraftsResources('Plot', PlotNames);


	//GET additional info
	const infoOfPlots=[];
	try {
		
		let loadedPlots = 0;
		for (let objr of objrs) {
			data_info = await Crafts.getData(config.craftsConfig.resourcesTemplate, objr);
			infoOfPlots.push(data_info);

			// Update progress bar
			loadedPlots++;
			const progressPercentage = (loadedPlots / objrs.length) * 100;
			progressBar.style.width = progressPercentage + '%';
			progressText.textContent = `${Math.round(progressPercentage)}%`;

			
			
		}
		setTimeout(()=>{
			loadingOverlay.style.display = 'none';
			progressText.textContent='0%';
			progressBar.style.width='0%';
		},600)
		flattenedInfoOfPlots = infoOfPlots.flat();
		console.log(flattenedInfoOfPlots);
		
		
	} catch (error) {
		console.log(error);
		return ;
	}


	//Create empty json for polygon plots	
	const polygonPlots = {};

	// Add the number of plots
	polygonPlots.NumberOfPlots = totalPlots.length;

		// Iterate over the filteredPlots and flattenedInfoOfPlots arrays simultaneously
	for (let i = 0; i < totalPlots.length && i < flattenedInfoOfPlots.length; i++) {
		const plot = totalPlots[i];
		const info = flattenedInfoOfPlots[i];

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
				province:info.province,
				infoSpecies:[]
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
			// 	plotInfo.infoSpecies = info.infoSpecies[0];

			// 	// Collect all unique species, keeping only the last identifier after the last /
			// 	const uniqueSpecies = new Set();
			// 	info.infoSpecies.forEach(speciesInfo => {
			// 		const speciesID = speciesInfo.species.split('/').pop(); // Get the last part of the species URL
			// 		uniqueSpecies.add(speciesID);
			// 	});
			// 	plotInfo.uniqueSpecies = Array.from(uniqueSpecies); // Convert Set to Array
			// }

			// Push the plot information into the provinceData JSON object under the province name
			if (!polygonPlots[modifiedPlotName]) {
				polygonPlots[modifiedPlotName] = [];
			}
			polygonPlots[modifiedPlotName].push(plotInfo);
		}
	}
	console.log(polygonPlots);

	return polygonPlots;



}



export {prepararDescarga,downloadDataPol}