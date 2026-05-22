/**
 * SCRIPT NEGATIVOS SEARCH — ADS ENGINE AUDIT V2.0
 * Francisco Blanco © 2026 — franciscoblanco.net
 *
 * Analiza los términos de búsqueda de los últimos 30 días y genera
 * una lista de candidatos a negativos: términos con gasto > umbral
 * y 0 conversiones.
 *
 * INSTRUCCIONES:
 * 1. Abre Google Ads → Herramientas → Scripts
 * 2. Crea un script nuevo y pega este código
 * 3. Ajusta GASTO_MINIMO y DIAS según tu cuenta
 * 4. Ejecuta en modo "Vista previa" primero
 */

var CONFIG = {
  GASTO_MINIMO_EUR: 5,   // € mínimos gastados para considerar el término
  DIAS:             30,   // ventana de análisis
  EXPORTAR_EMAIL:   ''    // deja vacío para no enviar email
};

function main() {
  var fechaFin    = new Date();
  var fechaInicio = new Date(fechaFin.getTime() - CONFIG.DIAS * 24 * 60 * 60 * 1000);

  var fmt = function(d) {
    return Utilities.formatDate(d, AdsApp.currentAccount().getTimeZone(), 'yyyyMMdd');
  };

  var query =
    'SELECT Query, Clicks, Impressions, Cost, Conversions, CampaignName, AdGroupName ' +
    'FROM SEARCH_QUERY_PERFORMANCE_REPORT ' +
    'WHERE Conversions = 0 ' +
    '  AND Cost > ' + Math.round(CONFIG.GASTO_MINIMO_EUR * 1000000) + ' ' +
    'DURING ' + fmt(fechaInicio) + ',' + fmt(fechaFin);

  var report = AdsApp.report(query);
  var rows   = report.rows();

  var candidatos = [];
  while (rows.hasNext()) {
    var r = rows.next();
    candidatos.push({
      termino:  r['Query'],
      campana:  r['CampaignName'],
      adGroup:  r['AdGroupName'],
      clics:    parseInt(r['Clicks'], 10),
      imps:     parseInt(r['Impressions'], 10),
      costeEur: (parseInt(r['Cost'], 10) / 1000000).toFixed(2)
    });
  }

  // Ordenar por coste descendente
  candidatos.sort(function(a, b) { return parseFloat(b.costeEur) - parseFloat(a.costeEur); });

  Logger.log('======================================');
  Logger.log('CANDIDATOS A NEGATIVOS — SEARCH');
  Logger.log('Período: últimos ' + CONFIG.DIAS + ' días');
  Logger.log('Umbral gasto: >' + CONFIG.GASTO_MINIMO_EUR + '€ con 0 conv.');
  Logger.log('======================================');

  if (candidatos.length === 0) {
    Logger.log('✓ No se encontraron términos candidatos a negativos.');
    return;
  }

  candidatos.forEach(function(c, i) {
    Logger.log(
      (i + 1) + '. [' + c.costeEur + '€ | ' + c.clics + ' clics] ' + c.termino +
      '\n   Campaña: ' + c.campana + ' > ' + c.adGroup
    );
  });

  Logger.log('--------------------------------------');
  Logger.log('Total candidatos: ' + candidatos.length);
  Logger.log('Coste desperdiciado estimado: ' +
    candidatos.reduce(function(s, c) { return s + parseFloat(c.costeEur); }, 0).toFixed(2) + '€');

  if (CONFIG.EXPORTAR_EMAIL) {
    var cuerpo = candidatos.map(function(c, i) {
      return (i + 1) + '. ' + c.termino + ' — ' + c.costeEur + '€ — ' + c.campana;
    }).join('\n');
    MailApp.sendEmail(CONFIG.EXPORTAR_EMAIL,
      'Candidatos a negativos Search — ' + AdsApp.currentAccount().getName(),
      cuerpo);
    Logger.log('Email enviado a ' + CONFIG.EXPORTAR_EMAIL);
  }
}
