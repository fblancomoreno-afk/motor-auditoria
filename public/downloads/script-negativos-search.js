/**
 * SCRIPT NEGATIVOS SEARCH — ADS ENGINE AUDIT V2.0
 * Francisco Blanco © 2026 — franciscoblanco.net
 */

var CONFIG = {
  GASTO_MINIMO_EUR: 5,
  DIAS:             30,
  EXPORTAR_EMAIL:   ''
};

function main() {
  var query =
    'SELECT search_term_view.search_term, metrics.clicks, metrics.impressions, ' +
    'metrics.cost_micros, metrics.conversions, campaign.name, ad_group.name ' +
    'FROM search_term_view ' +
    'WHERE metrics.conversions = 0 ' +
    '  AND metrics.cost_micros > ' + Math.round(CONFIG.GASTO_MINIMO_EUR * 1000000) + ' ' +
    'DURING %%DATE_RANGE%%';

  var report = AdsApp.report(query);
  var rows   = report.rows();
  var candidatos = [];

  while (rows.hasNext()) {
    var r = rows.next();
    candidatos.push({
      termino:  r['search_term_view.search_term'],
      campana:  r['campaign.name'],
      adGroup:  r['ad_group.name'],
      clics:    parseInt(r['metrics.clicks'], 10),
      imps:     parseInt(r['metrics.impressions'], 10),
      costeEur: (parseInt(r['metrics.cost_micros'], 10) / 1000000).toFixed(2)
    });
  }

  candidatos.sort(function(a, b) { return parseFloat(b.costeEur) - parseFloat(a.costeEur); });

  Logger.log('======================================');
  Logger.log('CANDIDATOS A NEGATIVOS — SEARCH');
  Logger.log('Período: %%DATE_LABEL%%');
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
