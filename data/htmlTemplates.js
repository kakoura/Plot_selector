import dict from '../data/dictionary.json';
import { getLiteral } from '../modules/util.js';

/*********************
*** TEMPLATES FILE ***
**********************/	
let cardTemplate;
let filtroTaxonesTemplate;
let taxonesSubheadingTemplate;
let sugeTaxonesTemplate;
let taxonesBlockTemplate;
let sugeLugaresTemplate;
let taxonModalTemplate;
let layerGroupTemplate;
let provPopupTemplate;
let plotPopupTemplate;
let downloadTemplateBody;
let downloadingTemplateBody;
let footerDescargaDatos;
let footerDescargaDatosExito;


function updateHTMLtemplates() {
	cardTemplate = 
'<div id="tarjeta" class="card-body mitarjeta p-1 d-none" > \
	<div class="d-flex flex-row"> \
		<div class="dropdown"> \
			<button id ="bot_inicio" class="btn btn-outline-secondary" type="button" \
				data-bs-toggle="dropdown" aria-expanded="false"><i class="bi bi-list"></i> \
			</button> \
			<ul class="dropdown-menu"> \
				<li><a id="tarjeta-home" class="dropdown-item home" href="#">'+getLiteral(dict.ttHome)+'</a></li> \
			    <li><hr class="dropdown-divider"></li> \
			    <li><a class="dropdown-item lang" tag="en" href="#">🇬🇧 EN</a></li> \
				<li><a class="dropdown-item lang" tag="es" href="#">🇪🇸 ES</a></li> \
			</ul> \
		</div> \
		<div class="btn-group"> \
			<button id="bot_taxones" class="text-nowrap btn btn-outline-secondary ms-1" type="button" disabled> \
				'+getLiteral(dict.taxonfilter)+'</button> \
			<input id="mapchecknomci" type="checkbox" class="btn-check nomci" id="btn-check" autocomplete="off" {{#nomci}}checked{{/nomci}} > \
			<label id="bot_mapnomci" class="btn btn-outline-secondary" for="mapchecknomci"><i class="bi bi-mortarboard-fill"></i></label> \
		</div> \
		<div id="lugares_heading" class="flex-fill ms-1 me-1 me-sm-0 d-none"> \
			<input id="in_lugares" autocomplete="off" type="search" class="form-control " \
				placeholder="'+getLiteral(dict.searchplace)+'" aria-label="'+getLiteral(dict.searchplace)+'"> \
		</div> \
	</div> \
	<div id="sugelugares" class="list-group mt-2 d-none"></div> \
	<div id="taxones_subheading"></div> \
	<div id="taxones_block" class="taxones_block list-group overflow-auto mt-1 d-none" style="max-height:50vh;"></div> \
	<div id="filtros_taxon" class="mt-1 d-none"></div> \
	<div id="mibarradiv" class="progress mt-1 d-none" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"> \
        <div id="mibarra" class="progress-bar progress-bar-striped progress-bar-animated bg-secondary" style="width: 0%" >0%</div> \
        <div id="mibarra_loading" class="text-center text-dark" style="width: 100%">'+getLiteral(dict.loadingdata)+'</div> \
    </div> \
</div>';


	filtroTaxonesTemplate =
	'{{#.}} \
		<div class="d-flex align-items-center border div_filtro_taxon" style="background-color: {{color}};"> \
			<div class="ms-2">{{{textoFiltroTaxon}}}</div> \
			<div class="ms-auto"> \
				<button class="btn btn-sm info_taxon {{^info}}d-none{{/info}}" type="button" turi="{{{turi}}}" > \
					<i class="bi bi-info-circle-fill"></i> \
				</button> \
			</div> \
			<div class="me-2"> \
				<button class="btn btn-sm color_filtro" type="button" data-bs-toggle="dropdown" aria-expanded="false"> \
					<i class="bi bi-droplet-fill"></i> \
				</button> \
				<ul id="ul_colores{{ind}}" class="dropdown-menu" aria-labelledby="dropdownMenu"> \
					{{#colores}} \
						<li><a class="dropdown-item color_taxon" href="#" ind="{{ind}}" cind="{{cind}}">{{label}}</a></li> \
					{{/colores}} \
				</ul> \
			</div> \
			<div class="me-2 pb-1 quitar_taxon" ind="{{ind}}"> \
				<button type="button" class="btn-close" aria-label="Close"></button> \
			</div> \
		</div> \
	{{/.}}';
	

	taxonesSubheadingTemplate = 
	'{{#activar}} \
		<input autocomplete="off" type="search" class="in_taxon form-control my-1" \
			 placeholder="'+getLiteral(dict.searchtaxon)+'" aria-label="'+getLiteral(dict.searchtaxon)+'"> \
	{{/activar}} \
	<div class="sugetaxones list-group"></div>';


	sugeTaxonesTemplate = 
	'{{#sugerencias}} \
		<button class="list-group-item list-group-item-action bot_suge_taxon" type="button" spuri="{{uri}}"> \
			{{#nc}}<i>{{/nc}}{{{labelshown}}}{{#nc}}</i>{{/nc}}<span class="badge rounded-pill text-bg-secondary float-end me-0">{{nclasses}} S</span> \
			<span class="badge rounded-pill text-bg-secondary float-end me-1">{{nindivs}}</span> \
		</button> \
	{{/sugerencias}} \
	{{#nosugerencias}} \
		<button type="button" class="list-group-item list-group-item-action py-2 bot_suge_taxon" disabled>'+getLiteral(dict.notaxonfound)+'</button> \
	{{/nosugerencias}}';


	taxonesBlockTemplate = 
	'{{#.}} \
		<div class="{{^esconder}}d-flex {{/esconder}}bd-highlight border-bottom border-left border-right taxon {{#esconder}}d-none{{/esconder}}" indice="{{indice}}"> \
			{{#botonesconder}} \
				<div><span>{{{indentspace}}}</span><span><button type="button" class="btn btn-outline-secondary btn-sm showmore">'+getLiteral(dict.showmore)+'</button></span></div> \
			{{/botonesconder}} \
			{{^botonesconder}} \
				<div class="flex-grow-1"> \
					<button class="list-group-item list-group-item-action border-0 bot_sel_taxon" type="button" spuri="{{uri}}"> \
						{{{indentspace}}}{{#nc}}<i>{{/nc}}{{label}}{{#nc}}</i>{{/nc}} \
						<span class="badge rounded-pill text-bg-secondary float-end me-0">{{nclasses}} S</span> \
						<span class="badge rounded-pill text-bg-secondary float-end me-1">{{nindivs}}</span> \
					</button> \
				</div> \
				<div class="p-1"> \
					<button class="btn btn-outline-secondary btn-sm bot_expandir_taxon {{#nosubclasses}}invisible{{/nosubclasses}}" \
						type="button" data-placement="top"><i class="bi bi-chevron-right"></i> \
					</button> \
				</div> \
			{{/botonesconder}} \
		</div> \
	{{/.}}';


	sugeLugaresTemplate = 
	'{{#sugerencias}} \
		<button type="button" class="list-group-item list-group-item-action py-2 bot_suge_lugar" id="{{id}}">{{{name}}}</button> \
	{{/sugerencias}} \
	{{#nosugerencias}} \
		<button type="button" class="list-group-item list-group-item-action py-2" disabled>'+getLiteral(dict.noplacesfound)+'</button> \
	{{/nosugerencias}}';

	taxonModalTemplate =
	'<div class="container-fluid"> \
		{{#hayimagen}} \
			<div class="row"> \
				<div class="col-sm-5"> \
		{{/hayimagen}} \
					<h5 class="text-muted">{{tipo}}</h5> \
		{{#hayimagen}} \
			{{^multimages}} \
					<img class="img-fluid mt-1 mb-2" src="{{{image}}}"> \
			{{/multimages}} \
			{{#multimages}} \
				<div id="carouselPopupTaxon" class="carousel slide" data-bs-ride="carousel"> \
					<div class="carousel-inner"> \
						{{#image}} \
							<div class="carousel-item {{#active}}active{{/active}}"> \
								<img src="{{{src}}}" > \
							</div> \
						{{/image}} \
					</div> \
					<button class="carousel-control-prev" type="button" data-bs-target="#carouselPopupTaxon" data-bs-slide="prev"> \
						<span class="carousel-control-prev-icon" aria-hidden="true"></span> \
						<span class="visually-hidden">Previous</span> \
					</button> \
					<button class="carousel-control-next" type="button" data-bs-target="#carouselPopupTaxon" data-bs-slide="next"> \
						<span class="carousel-control-next-icon" aria-hidden="true"></span> \
						<span class="visually-hidden">Next</span> \
					</button>   \
				</div> \
			{{/multimages}} \
				</div> \
				<div class="col-sm-7"> \
		{{/hayimagen}} \
					{{#resumen}} \
						<p>{{resumen}}</p> \
					{{/resumen}} \
					{{#gbifPage}} \
						<a href="{{{.}}}" target="_blank" \
							class="btn btn-secondary btn-sm">GBIF</a> \
					{{/gbifPage}} \
					{{#wikidataPage}} \
						<a href="{{{.}}}" target="_blank" \
							class="btn btn-secondary btn-sm">Wikidata</a> \
					{{/wikidataPage}} \
					{{#wikipediaPage}} \
						<a href="{{{.}}}" target="_blank" \
							class="btn btn-secondary btn-sm">Wikipedia</a> \
					{{/wikipediaPage}} \
					{{#wikispeciesPage}} \
						<a href="{{{.}}}" target="_blank" \
							class="btn btn-secondary btn-sm">WikiSpecies</a> \
					{{/wikispeciesPage}} \
		{{#hayimagen}} \
				</div> \
			</div> \
		{{/hayimagen}} \
	</div>';
		
	provPopupTemplate =
    '<div class="m-0 p-0"> \
        <strong>{{prov}}</strong> \
        <br><span class="text-muted">{{type}}</span> \
        <div style="padding-top:5px"> \
            <strong style="font-size: 110%">Plots in inventory:</strong> \
            {{#rows}} \
                <br>   {{#els}}{{.}}{{/els}} \
            {{/rows}} \
        </div> \
    </div>';
		
	
	plotPopupTemplate =
	'<div class="m-0 p-0"> \
		<strong>{{plot}}</strong> \
		{{#prov}} \
			<br>{{prov}} \
		{{/prov}} \
		{{#notabla}} \
			<div> \
				{{#rows}} \
					<br>{{{head}}}:  {{#els}}{{.}}{{/els}} \
				{{/rows}} \
			</div> \
		{{/notabla}} \
		{{^notabla}} \
			<table class="table table-borderless table-sm m-0"> \
				<thead> \
					<tr> \
						{{#head}} \
							{{{.}}} \
						{{/head}} \
					</tr> \
				</thead> \
				<tbody> \
					{{#rows}} \
						<tr> \
							<th scope="row">{{{head}}}</th> \
							{{#els}} \
								<td class="text-end">{{.}}</td> \
							{{/els}} \
						</tr> \
					{{/rows}} \
				</tbody> \
			</table> \
		{{/notabla}} \
		<br><i>'+getLiteral(dict.clickzoomin)+'</i> \
	</div>';
	

	layerGroupTemplate =
	'<div class="collapse card p-0" id="sel-layers"> \
		<div class="card-body p-1"> \
			<div class="row g-0"> \
				<div class="col-9 text-center"> \
					<h6 class="card-title m-1">' + getLiteral(dict.mapType) + '</h6> \
				</div> \
				<div class="col-3 text-center"> \
					<h6 class="card-title m-1">IFN</h6> \
				</div> \
			</div> \
			<div class="input-group"> \
				<div class="row text-center"> \
					<div class="col form-check"> \
						<input class="btn-check micheckmapa" type="radio" name="mapType" id="map-type-default" value="default"> \
						<label class="btn" for="map-type-default"> \
							<img src="default.png" class="img-fluid rounded" alt="..."> \
						</label> \
						<div class="text-nowrap">' + getLiteral(dict.default) + '</div> \
					</div> \
					<div class="col form-check"> \
						<input class="btn-check micheckmapa" type="radio" name="mapType" id="map-type-satellite" value="satellite"> \
						<label class="btn" for="map-type-satellite"> \
							<img src="satellite.png" class="img-fluid rounded" alt="..."> \
						</label> \
						<div class="text-nowrap">' + getLiteral(dict.satellite) + '</div> \
					</div> \
					<div class="col-auto"> \
						<div class="vertical-line"></div> \
					</div> \
					<div class="col"> \
						<input type="checkbox" class="btn-check micheckmapa" id="check-plots" autocomplete="off"> \
						<label class="btn" for="check-plots"> \
							<img src="plots.png" class="img-fluid rounded" alt="..."> \
						</label> \
						<div class="text-nowrap">' + getLiteral(dict.plots) + '</div> \
					</div> \
				</div> \
			</div> \
			<hr class="my-1"> \
			<div class="row g-0 mt-2"> \
				<div class="col text-center"> \
					<h6 class="card-title">' + getLiteral(dict.mapDetails) + '</h6> \
				</div> \
			</div> \
			<div class="input-group"> \
				<div class="row text-center g-0"> \
					<div class="col form-check ps-1 ps-sm-2"> \
						<input class="btn-check micheckmapa" type="radio" name="mapDetails" id="map-details-auto" value="auto"> \
						<label class="btn" for="map-details-auto"> \
							<img src="icon.png" class="img-fluid rounded" alt="..."> \
						</label> \
						<div class="text-nowrap">Auto</div> \
					</div> \
					<div class="col form-check ps-1 ps-sm-2"> \
						<input class="btn-check micheckmapa" type="radio" name="mapDetails" id="map-details-patches" value="patches"> \
						<label class="btn" for="map-details-patches"> \
							<img src="patches.png" class="img-fluid rounded" alt="..."> \
						</label> \
						<div class="text-nowrap">' + getLiteral(dict.patches) + '</div> \
					</div> \
					<div class="col form-check ps-1 ps-sm-2"> \
						<input class="btn-check micheckmapa" type="radio" name="mapDetails" id="map-details-regions" value="regions"> \
						<label class="btn" for="map-details-regions"> \
							<img src="regions.png" class="img-fluid rounded" alt="..."> \
						</label> \
						<div class="text-nowrap">' + getLiteral(dict.regions) + '</div> \
					</div> \
					<div class="col form-check ps-1 ps-sm-2"> \
						<input class="btn-check micheckmapa" type="radio" name="mapDetails" id="map-details-munis" value="munis"> \
						<label class="btn" for="map-details-munis"> \
							<img src="munis.png" class="img-fluid rounded" alt="..."> \
						</label> \
						<div class="text-nowrap">' + getLiteral(dict.municipalities) + '</div> \
					</div> \
				</div> \
			</div> \
		</div> \
	</div> \
	<div class="group mt-auto ms-auto"> \
		<!--a class="download disabled" title="' + getLiteral(dict.downloadData) + '" href="#" role="button" > \
			<span class="bi bi-cloud-download"></span> \
		</a--> \
		<a class="layer" title="' + getLiteral(dict.selectLayer) + '" href="#sel-layers" role="button" \
				data-bs-toggle="collapse" aria-expanded="false" aria-controls="sel-layers"> \
			<span class="bi bi-layers-fill"></span> \
		</a> \
	</div>';


	downloadTemplateBody =
	'<div> \
		<p>'+getLiteral(dict.downloadMessage)+'</p> \
		<span>'+getLiteral(dict.downloadChoices)+'</span> \
		{{#plotsAvailable}} \
		<div class="form-check"> \
			<input class="form-check-input check-download plots" type="checkbox" value="" id="checkPlots"> \
			<label class="form-check-label" for="checkPlots">'+getLiteral(dict.checkPlots)+'</label> \
		</div> \
		<div class="form-check"> \
			<input class="form-check-input check-download trees" type="checkbox" value="" id="checkTrees"> \
			<label class="form-check-label" for="checkTrees">'+getLiteral(dict.checkTrees)+'</label> \
		</div> \
		{{/plotsAvailable}} \
		<div class="form-check"> \
			<input class="form-check-input check-download regions" type="checkbox" value="" id="checkRegions"> \
			<label class="form-check-label" for="checkRegions">'+getLiteral(dict.checkRegions)+'</label> \
		</div> \
		<div class="form-check"> \
			<input class="form-check-input check-download patches" type="checkbox" value="" id="checkPatches"> \
			<label class="form-check-label" for="checkPatches">'+getLiteral(dict.checkPatches)+'</label> \
		</div> \
		<div id="downloadNothing"><strong>'+getLiteral(dict.downloadNothing)+'</strong></div> \
		<br><div>'+getLiteral(dict.downloadFormatChoose)+'</div> \
		<input type="radio" class="btn-check downloadRadio" name="format" id="GeoJSON" autocomplete="off"> \
		<label class="btn btn-outline-primary" for="GeoJSON">GeoJSON</label> \
		<input type="radio" class="btn-check downloadRadio" name="format" id="CSV" autocomplete="off"> \
		<label class="btn btn-outline-primary" for="CSV">CSV</label> \
		<div id="downloadNoFormat"><strong>'+getLiteral(dict.downloadNoFormat)+'</strong></div> \
	</div>';
	
	downloadingTemplateBody =
	'<div> \
		<div id="downloadingPlots" class="d-none"><i class="bi bi-arrow-right-circle"></i> \
			<span class="ms-1">'+ getLiteral(dict.downloadingPlots) +'</span> \
		</div> \
		<div id="plotsDownloaded" class="d-none"><i class="bi bi-check-lg"></i> \
			<span class="ms-1">'+ getLiteral(dict.plotsDownloaded) +'</span> \
		</div> \
		<div id="noPlotsDownloaded" class="d-none"><i class="bi bi-info-circle"></i> \
			<span class="ms-1">'+ getLiteral(dict.noPlotsDownloaded) +'</span> \
		</div> \
		<div id="downloadingTrees" class="d-none"><i class="bi bi-arrow-right-circle"></i> \
			<span class="ms-1">'+ getLiteral(dict.downloadingTrees) +'</span> \
		</div> \
		<div id="treesDownloaded" class="d-none"><i class="bi bi-check-lg"></i> \
			<span class="ms-1">'+ getLiteral(dict.treesDownloaded) +'</span> \
		</div> \
		<div id="noTreesDownloaded" class="d-none"><i class="bi bi-info-circle"></i> \
			<span class="ms-1">'+ getLiteral(dict.noTreesDownloaded) +'</span> \
		</div> \
		<div id="downloadingRegions" class="d-none"><i class="bi bi-arrow-right-circle"></i> \
			<span class="ms-1">'+ getLiteral(dict.downloadingRegions) +'</span> \
		</div> \
		<div id="regionsDownloaded" class="d-none"><i class="bi bi-check-lg"></i> \
			<span class="ms-1">'+ getLiteral(dict.regionsDownloaded) +'</span> \
		</div> \
		<div id="downloadingPatches" class="d-none"><i class="bi bi-arrow-right-circle"></i> \
			<span class="ms-1">'+ getLiteral(dict.downloadingPatches) +'</span> \
		</div> \
		<div id="patchesDownloaded" class="d-none"><i class="bi bi-check-lg"></i> \
			<span class="ms-1">'+ getLiteral(dict.patchesDownloaded) +'</span> \
		</div> \
		<div id="noPatchesDownloaded" class="d-none"><i class="bi bi-info-circle"></i> \
			<span class="ms-1">'+ getLiteral(dict.noPatchesDownloaded) +'</span> \
		</div> \
		<div id="mibarradescarga_div" class="progress my-1" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"> \
			<div id="mibarradescarga" class="progress-bar progress-bar-striped progress-bar-animated bg-primary" style="width: 0%" >0%</div> \
		</div> \
		<div id="downloadSuccess" class="d-none"><br><strong>'+getLiteral(dict.downloadSuccess)+'</strong></div> \
	</div>';
	
	footerDescargaDatos = 
	'<button id="downloadClose" type="button" class="btn btn-secondary" \
			data-bs-dismiss="modal" aria-label="Close" ">'+getLiteral(dict.cancel)+'</button> \
	<button id="downloadData" type="button" class="btn btn-primary" disabled>'+getLiteral(dict.download)+'</button>';
	
	footerDescargaDatosExito = 
	'<button id="downloadClose" type="button" class="btn btn-primary" \
			data-bs-dismiss="modal" aria-label="Close" ">'+getLiteral(dict.close)+'</button>';


	/*
	alertQuestionnaireTemplate = 
	'<div id="questalert" class="alert alert-light ms-2 ms-md-2 mb-4 p-2 alert-dismissible fade show" role="alert"> \
		<p class="mb-1">'+getLiteral(dict.questtext)+'</p> \
		<button id="questbotyes" type="button" questurl="'+getLiteral(dict.questurl)+'" class="btn btn-outline-secondary btn-sm">'+getLiteral(dict.yes)+'</button>\
		<button id="questbotno" type="button" class="btn btn-outline-secondary btn-sm">'+getLiteral(dict.no)+'</button>\
		<button id="questbotlater" type="button" class="btn btn-outline-secondary btn-sm">'+getLiteral(dict.later)+'</button>\
	</div>';*/
}

export { cardTemplate, filtroTaxonesTemplate, taxonesSubheadingTemplate, sugeTaxonesTemplate, taxonesBlockTemplate, 
	sugeLugaresTemplate, taxonModalTemplate, provPopupTemplate, plotPopupTemplate, layerGroupTemplate,
	downloadTemplateBody, downloadingTemplateBody, footerDescargaDatos, footerDescargaDatosExito, updateHTMLtemplates };