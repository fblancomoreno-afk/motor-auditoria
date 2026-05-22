/**
 * SCRIPT NEGATIVOS PMAX — ADS ENGINE AUDIT V2.0
 * Francisco Blanco © 2026 — franciscoblanco.net
 *
 * Diagnostica el rendimiento de campañas Performance Max y genera
 * un informe con recomendaciones de exclusión de audiencias y términos.
 *
 * NOTA: PMax tiene soporte limitado de negativos vía API/Scripts.
 * Este script identifica señales para añadir negativos manualmente
 * desde la interfaz de Google Ads o vía exclusiones de lista de negativos
 * compartida (máx. 10.000 negativos admitidos).
 *
 * INSTRUCCIONES:
 * 1. Abre Google Ads → Herramientas → Scripts
 * 2. Crea un script nuevo y pega este código
 * 3. Ejecuta en modo "Vista previa" y revisa el log
 */

var CONFIG = {
  DIAS:           30,
  CPA_LIMITE_EUR: 100,   // CPA máximo tolerable (€) — ajusta según tu cuenta
  EXPORTAR_EMAIL: ''     // deja vacío para no enviar email
};

function main() {
  Logger.log('======================================');
  Logger.log('DIAGNÓSTICO PMAX — ADS ENGINE AUDIT');
  Logger.log('Período: últimos ' + CONFIG.DIAS + ' días');
  Logger.log('======================================\n');

  var campanasIter = AdsApp.campaigns()
    .withCondition('Status = ENABLED')
    .withCondition('AdvertisingChannelType = PERFORMANCE_MAX')
    .get();

  var resumen      = [];
  var totalCoste   = 0;
  var totalConvs   = 0;

  while (campanasIter.hasNext()) {
    var campana = campanasIter.next();
    var stats   = campana.getStatsFor('LAST_' + CONFIG.DIAS + '_DAYS');

    var coste   = stats.getCost();
    var convs   = stats.getConversions();
    var clics   = stats.getClicks();
    var imps    = stats.getImpressions();
    var cpa     = convs > 0 ? coste / convs : null;
    var ctr     = imps > 0 ? (clics / imps * 100).toFixed(2) : '0';

    totalCoste += coste;
    totalConvs += convs;

    var alertas = [];
    if (convs === 0 && coste > 0)            alertas.push('SIN CONVERSIONES — revisar señales de audiencia y asset groups');
    if (cpa !== null && cpa > CONFIG.CPA_LIMITE_EUR) alertas.push('CPA alto (' + cpa.toFixed(2) + '€) — revisar búsquedas generadas y excluir términos informativos');
    if (parseFloat(ctr) < 1.5)              alertas.push('CTR bajo (' + ctr + '%) — revisar creatividades y audiencias señal');

    Logger.log('Campaña: ' + campana.getName());
    Logger.log('  Coste:        ' + coste.toFixed(2) + '€');
    Logger.log('  Conversiones: ' + convs);
    Logger.log('  CPA:          ' + (cpa !== null ? cpa.toFixed(2) + '€' : 'N/D'));
    Logger.log('  CTR:          ' + ctr + '%');

    if (alertas.length) {
      Logger.log('  ALERTAS:');
      alertas.forEach(function(a) { Logger.log('    ⚠ ' + a); });
    } else {
      Logger.log('  ✓ Rendimiento dentro de parámetros');
    }
    Logger.log('');

    resumen.push({ nombre: campana.getName(), coste: coste, convs: convs, cpa: cpa, alertas: alertas });
  }

  Logger.log('--------------------------------------');
  Logger.log('RESUMEN GLOBAL PMAX');
  Logger.log('  Coste total:        ' + totalCoste.toFixed(2) + '€');
  Logger.log('  Conversiones total: ' + totalConvs);
  Logger.log('  CPA global:         ' + (totalConvs > 0 ? (totalCoste / totalConvs).toFixed(2) + '€' : 'N/D'));
  Logger.log('');
  Logger.log('ACCIONES RECOMENDADAS:');
  Logger.log('  1. Añadir lista de negativos compartida con términos: gratis, cursos, opiniones, qué es, wikipedia, youtube tutorial');
  Logger.log('  2. Excluir audiencias de competidores (si tienes la lista en Customer Match)');
  Logger.log('  3. Excluir clientes actuales de campañas de captación');
  Logger.log('  4. Revisar Search Themes configurados (máx. 50 disponibles por asset group)');
  Logger.log('======================================');

  if (CONFIG.EXPORTAR_EMAIL && resumen.length) {
    var cuerpo = resumen.map(function(c) {
      return c.nombre + '\n  Coste: ' + c.coste.toFixed(2) + '€ | Conv: ' + c.convs +
        (c.alertas.length ? '\n  Alertas: ' + c.alertas.join(' | ') : '');
    }).join('\n\n');
    MailApp.sendEmail(CONFIG.EXPORTAR_EMAIL,
      'Diagnóstico PMax — ' + AdsApp.currentAccount().getName(), cuerpo);
    Logger.log('Email enviado a ' + CONFIG.EXPORTAR_EMAIL);
  }
}
