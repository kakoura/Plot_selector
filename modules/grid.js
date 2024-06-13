import config from '../data/config.json';

// import L from 'leaflet';
import { Datos } from '../main.js';
import { Sesion } from '../main.js';


function getCellSide(zoom) {
    // console.log(zoom)
	if (!Datos.ladosCeldas[zoom]) {
		const potencia = Math.pow(2, zoom - 6);
		Datos.ladosCeldas[zoom] = config.degreesStep6/potencia;
	}
	return Datos.ladosCeldas[zoom];
}
// a partir de unos bounds genero la malla que lo envuelve para el zoom z
function getGrid(bounds, z) {
	// recupero zoom
	const zoom = z? z : Sesion.zoom;
	// recupero cellSide
	const cellSide = getCellSide(zoom);
	// preparo grid
	const grid = {
		'cellN': Math.floor( bounds.getNorth() / cellSide ),
		'cellS': Math.floor( bounds.getSouth() / cellSide ),
		'cellE': Math.floor( bounds.getEast() / cellSide ),
		'cellW': Math.floor( bounds.getWest() / cellSide )
	};
	// devuelvo grid
	return grid;
}

function getGridBounds(grid, z) {
	// recupero zoom
	const zoom = z? z : Sesion.zoom;
	// recupero cellSide
	const cellSide = getCellSide(zoom);
	// devuelvo objeto bounds en formato Leaflet
	return L.latLngBounds([
			[ grid.cellS * cellSide, // S
				grid.cellW * cellSide ], // W
			[ (grid.cellN + 1) * cellSide, // N
				(grid.cellE + 1) * cellSide ] // E			
		]);
}

export {getGridBounds, getGrid}