/**
 * SCRIPT AUDITORÍA PMAX — ADS ENGINE AUDIT V3.0
 * Francisco Blanco © 2026 — franciscoblanco.net
 *
 * Audita campañas Performance Max a nivel ASSET GROUP usando GAQL moderno.
 * Compatible con TODAS las cuentas PMax (servicios y Shopping).
 *
 * QUÉ HACE:
 * 1. Lista cada Asset Group activo con métricas reales (coste, conv, CPA, CTR)
 * 2. Genera alertas dinámicas por Asset Group (no solo a nivel campaña)
 * 3. Extrae search terms categorizados (campaign_search_term_insight)
 *    para detectar términos candidatos a excluir
 * 4. Exporta resumen a Google Sheets + email opcional
 *
 * INSTRUCCIONES:
 * 1. Google Ads → Herramientas → Bulk actions → Scripts → Nuevo
 * 2. Pega este código y autoriza permisos
 * 3. Ejecuta en "Vista previa" primero, revisa el log
 * 4. Si todo OK, ejecuta sin vista previa
 */

var CONFIG = {
  DIAS:              30,
  CPA_LIMITE_EUR:    100,    // CPA máximo tolerable por Asset Group
  CTR_MINIMO:        1.5,    // CTR mínimo aceptable (%)
  COSTE_SIN_CONV:    30,     // Umbral coste sin conversión para alertar (€)
  TOP_TERMINOS:      20,     // Nº de search categories a mostrar
  EXPORTAR_SHEET:    true,   // Crear Google Sheet con resultados
  EXPORTAR_EMAIL:    ''      // Email destino (vacío = no enviar)
};

function main() {
  Logger.log('=========================================');
  Logger.log('AUDITORÍA PMAX V3.0 — ADS ENGINE AUDIT');
  Logger.log('Período: últimos ' + CONFIG.DIAS + ' días');
  Logger.log('Cuenta: ' + AdsApp.currentAccount().getName());
  Logger.log('=========================================\n');

  var rangoFecha = construirRangoFecha(CONFIG.DIAS);
  var assetGroups = auditarAssetGroups(rangoFecha);
  var terminos    = extraerSearchInsights(rangoFecha);

  imprimirResumen(assetGroups, terminos);

  if (CONFIG.EXPORTAR_SHEET) {
    var urlSheet = exportarSheet(assetGroups, terminos);
    Logger.log('\n📊 Google Sheet: ' + urlSheet);
  }

  if (CONFIG.EXPORTAR_EMAIL) {
    enviarEmail(assetGroups, terminos);
    Logger.log('📧 Email enviado a ' + CONFIG.EXPORTAR_EMAIL);
  }
}

/**
 * Construye el rango de fecha en formato YYYY-MM-DD para GAQL
 */
function construirRangoFecha(dias) {
  var hoy = new Date();
  var desde = new Date();
  desde.setDate(hoy.getDate() - dias);
  var fmt = function(d) {
    return Utilities.formatDate(d, AdsApp.currentAccount().getTimeZone(), 'yyyy-MM-dd');
  };
  return { desde: fmt(desde), hasta: fmt(hoy) };
}

/**
 * Audita Asset Groups vía GAQL — funciona en TODAS las cuentas PMax
 */
function auditarAssetGroups(rango) {
  var query =
    'SELECT ' +
      'campaign.id, ' +
      'campaign.name, ' +
      'asset_group.id, ' +
      'asset_group.name, ' +
      'asset_group.status, ' +
      'metrics.cost_micros, ' +
      'metrics.clicks, ' +
      'metrics.impressions, ' +
      'metrics.conversions, ' +
      'metrics.conversions_value, ' +
      'metrics.ctr ' +
    'FROM asset_group ' +
    'WHERE campaign.advertising_channel_type = "PERFORMANCE_MAX" ' +
      'AND campaign.status = "ENABLED" ' +
      'AND asset_group.status = "ENABLED" ' +
      'AND segments.date BETWEEN "' + rango.desde + '" AND "' + rango.hasta + '"';

  var resultados = [];
  var iter = AdsApp.search(query);

  while (iter.hasNext()) {
    var row = iter.next();
    var coste  = (row.metrics.costMicros || 0) / 1000000;
    var clics  = parseInt(row.metrics.clicks || 0, 10);
    var imps   = parseInt(row.metrics.impressions || 0, 10);
    var convs  = parseFloat(row.metrics.conversions || 0);
    var valor  = parseFloat(row.metrics.conversionsValue || 0);
    var ctr    = imps > 0 ? (clics / imps * 100) : 0;
    var cpa    = convs > 0 ? coste / convs : null;
    var roas   = coste > 0 ? valor / coste : null;

    var alertas = generarAlertas(coste, convs, cpa, ctr);

    resultados.push({
      campana:     row.campaign.name,
      assetGroup:  row.assetGroup.name,
      coste:       coste,
      clics:       clics,
      imps:        imps,
      convs:       convs,
      valor:       valor,
      cpa:         cpa,
      ctr:         ctr,
      roas:        roas,
      alertas:     alertas
    });
  }

  return resultados;
}

/**
 * Genera alertas dinámicas por Asset Group
 */
function generarAlertas(coste, convs, cpa, ctr) {
  var alertas = [];

  if (coste >= CONFIG.COSTE_SIN_CONV && convs === 0) {
    alertas.push('⚠ Gasto sin conversiones (' + coste.toFixed(2) + '€) — revisar señales de audiencia');
  }
  if (cpa !== null && cpa > CONFIG.CPA_LIMITE_EUR) {
    alertas.push('⚠ CPA alto: ' + cpa.toFixed(2) + '€ (límite ' + CONFIG.CPA_LIMITE_EUR + '€) — excluir términos informativos');
  }
  if (ctr > 0 && ctr < CONFIG.CTR_MINIMO) {
    alertas.push('⚠ CTR bajo: ' + ctr.toFixed(2) + '% — revisar creatividades y headlines');
  }
  if (coste > 0 && convs > 0 && cpa !== null && cpa <= CONFIG.CPA_LIMITE_EUR) {
    alertas.push('✓ Rendimiento dentro de parámetros');
  }
  if (coste === 0) {
    alertas.push('ℹ Sin gasto en el período — asset group inactivo o sin entrega');
  }

  return alertas;
}

/**
 * Extrae search term insights de PMax (categorías agrupadas)
 * Soportado en GAQL desde 2023, funciona en todas las cuentas PMax
 */
function extraerSearchInsights(rango) {
  var query =
    'SELECT ' +
      'campaign_search_term_insight.category_label, ' +
      'metrics.clicks, ' +
      'metrics.impressions, ' +
      'metrics.conversions, ' +
      'metrics.conversions_value ' +
    'FROM campaign_search_term_insight ' +
    'WHERE segments.date BETWEEN "' + rango.desde + '" AND "' + rango.hasta + '" ' +
    'ORDER BY metrics.impressions DESC ' +
    'LIMIT ' + CONFIG.TOP_TERMINOS;

  var terminos = [];

  try {
    var iter = AdsApp.search(query);
    while (iter.hasNext()) {
      var row = iter.next();
      var clics = parseInt(row.metrics.clicks || 0, 10);
      var imps  = parseInt(row.metrics.impressions || 0, 10);
      var convs = parseFloat(row.metrics.conversions || 0);
      var valor = parseFloat(row.metrics.conversionsValue || 0);
      var categoria = row.campaignSearchTermInsight.categoryLabel || '(sin categoría)';

      var candidato = (convs === 0 && imps > 100) ? '🚫 Candidato a excluir' : '';

      terminos.push({
        categoria: categoria,
        clics:     clics,
        imps:      imps,
        convs:     convs,
        valor:     valor,
        accion:    candidato
      });
    }
  } catch (e) {
    Logger.log('⚠ No se pudieron extraer search insights: ' + e.message);
    Logger.log('   Causa probable: cuenta nueva con datos insuficientes o permisos limitados.\n');
  }

  return terminos;
}

/**
 * Imprime resumen en el log
 */
function imprimirResumen(assetGroups, terminos) {
  Logger.log('───────────────────────────────────────');
  Logger.log('RENDIMIENTO POR ASSET GROUP');
  Logger.log('───────────────────────────────────────\n');

  if (assetGroups.length === 0) {
    Logger.log('No se encontraron Asset Groups activos en el período.\n');
    return;
  }

  var totalCoste = 0, totalConvs = 0, totalValor = 0;

  assetGroups.forEach(function(ag) {
    Logger.log('▸ Campaña: ' + ag.campana);
    Logger.log('  Asset Group: ' + ag.assetGroup);
    Logger.log('  Coste: ' + ag.coste.toFixed(2) + '€  |  Conv: ' + ag.convs.toFixed(2) +
               '  |  CPA: ' + (ag.cpa !== null ? ag.cpa.toFixed(2) + '€' : 'N/D') +
               '  |  CTR: ' + ag.ctr.toFixed(2) + '%' +
               '  |  ROAS: ' + (ag.roas !== null ? ag.roas.toFixed(2) + 'x' : 'N/D'));
    ag.alertas.forEach(function(a) { Logger.log('    ' + a); });
    Logger.log('');

    totalCoste += ag.coste;
    totalConvs += ag.convs;
    totalValor += ag.valor;
  });

  Logger.log('───────────────────────────────────────');
  Logger.log('TOTALES PMAX');
  Logger.log('───────────────────────────────────────');
  Logger.log('  Coste total:    ' + totalCoste.toFixed(2) + '€');
  Logger.log('  Conv. total:    ' + totalConvs.toFixed(2));
  Logger.log('  Valor conv.:    ' + totalValor.toFixed(2) + '€');
  Logger.log('  CPA medio:      ' + (totalConvs > 0 ? (totalCoste / totalConvs).toFixed(2) + '€' : 'N/D'));
  Logger.log('  ROAS medio:     ' + (totalCoste > 0 ? (totalValor / totalCoste).toFixed(2) + 'x' : 'N/D'));
  Logger.log('');

  Logger.log('───────────────────────────────────────');
  Logger.log('TOP ' + CONFIG.TOP_TERMINOS + ' CATEGORÍAS DE BÚSQUEDA');
  Logger.log('───────────────────────────────────────\n');

  if (terminos.length === 0) {
    Logger.log('Sin datos de search insights disponibles.\n');
  } else {
    terminos.forEach(function(t) {
      Logger.log('• ' + t.categoria);
      Logger.log('  Imp: ' + t.imps + ' | Clics: ' + t.clics + ' | Conv: ' + t.convs.toFixed(2) + '  ' + t.accion);
    });
    Logger.log('');
  }

  Logger.log('───────────────────────────────────────');
  Logger.log('ACCIONES RECOMENDADAS');
  Logger.log('───────────────────────────────────────');
  Logger.log('1. Revisar Asset Groups con alertas y ajustar señales de audiencia');
  Logger.log('2. Añadir categorías marcadas como "Candidato a excluir" a lista de negativos compartida');
  Logger.log('3. Solicitar a Google Account Manager exclusiones a nivel cuenta si CPA persiste alto');
  Logger.log('4. Revisar Search Themes en cada Asset Group (máx. 50 por grupo)');
  Logger.log('=========================================');
}

/**
 * Exporta resultados a Google Sheet
 */
function exportarSheet(assetGroups, terminos) {
  var nombre = 'Auditoría PMax — ' + AdsApp.currentAccount().getName() + ' — ' +
               Utilities.formatDate(new Date(), AdsApp.currentAccount().getTimeZone(), 'yyyy-MM-dd HH:mm');
  var ss = SpreadsheetApp.create(nombre);

  // Hoja 1: Asset Groups
  var sh1 = ss.getActiveSheet();
  sh1.setName('Asset Groups');
  sh1.appendRow(['Campaña', 'Asset Group', 'Coste (€)', 'Clics', 'Impresiones', 'Conversiones', 'Valor (€)', 'CPA (€)', 'CTR (%)', 'ROAS', 'Alertas']);
  assetGroups.forEach(function(ag) {
    sh1.appendRow([
      ag.campana, ag.assetGroup, ag.coste.toFixed(2), ag.clics, ag.imps,
      ag.convs.toFixed(2), ag.valor.toFixed(2),
      ag.cpa !== null ? ag.cpa.toFixed(2) : 'N/D',
      ag.ctr.toFixed(2),
      ag.roas !== null ? ag.roas.toFixed(2) : 'N/D',
      ag.alertas.join(' | ')
    ]);
  });
  sh1.getRange(1, 1, 1, 11).setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
  sh1.autoResizeColumns(1, 11);

  // Hoja 2: Search Insights
  var sh2 = ss.insertSheet('Search Insights');
  sh2.appendRow(['Categoría', 'Impresiones', 'Clics', 'Conversiones', 'Valor (€)', 'Acción']);
  terminos.forEach(function(t) {
    sh2.appendRow([t.categoria, t.imps, t.clics, t.convs.toFixed(2), t.valor.toFixed(2), t.accion]);
  });
  sh2.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
  sh2.autoResizeColumns(1, 6);

  return ss.getUrl();
}

/**
 * Envía resumen por email
 */
function enviarEmail(assetGroups, terminos) {
  var cuerpo = 'AUDITORÍA PMAX — ' + AdsApp.currentAccount().getName() + '\n\n';

  cuerpo += 'ASSET GROUPS (' + assetGroups.length + '):\n\n';
  assetGroups.forEach(function(ag) {
    cuerpo += '• ' + ag.campana + ' / ' + ag.assetGroup + '\n';
    cuerpo += '  Coste: ' + ag.coste.toFixed(2) + '€ | Conv: ' + ag.convs.toFixed(2) +
              ' | CPA: ' + (ag.cpa !== null ? ag.cpa.toFixed(2) + '€' : 'N/D') + '\n';
    if (ag.alertas.length) cuerpo += '  ' + ag.alertas.join(' | ') + '\n';
    cuerpo += '\n';
  });

  if (terminos.length) {
    cuerpo += '\nTOP CATEGORÍAS DE BÚSQUEDA:\n\n';
    terminos.slice(0, 10).forEach(function(t) {
      cuerpo += '• ' + t.categoria + ' — Imp: ' + t.imps + ' / Conv: ' + t.convs.toFixed(2) + ' ' + t.accion + '\n';
    });
  }

  MailApp.sendEmail(CONFIG.EXPORTAR_EMAIL,
    'Auditoría PMax — ' + AdsApp.currentAccount().getName(), cuerpo);
}
