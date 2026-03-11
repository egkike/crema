import { Parser } from 'json2csv';

import { adminRepository } from '../repositories/admin.repository';
import { payoutRepository } from '../repositories/payout.repository';

export class ExportService {
  /**
   * REPORTE FISCAL (Mendoza 2026): Genera el Libro IVA Ventas / Auditoría de Terceros.
   * Este es el archivo clave para el contador.
   */
  static async exportTaxAuditToCSV(currency: string, from?: string, to?: string): Promise<string> {
    const data = await adminRepository.getTaxAuditReport(currency, from, to);

    // Transformamos la data para "aplanar" el JSONB de impuestos
    const flattenedData = data.map(row => {
      const taxes = row.gateway_taxes_detail || {};
      return {
        ...row,
        // Creamos columnas dinámicas para los impuestos más comunes
        iva_retenido: taxes.iva || 0,
        iibb_mendoza: taxes.iibb_mendoza || 0,
        iibb_otras: taxes.iibb_otros || 0,
        otros_impuestos: taxes.otros || 0,
        // Formateamos la fecha para Excel
        sale_date: row.sale_date.toISOString().split('T')[0],
      };
    });

    const fields = [
      { label: 'Fecha Venta', value: 'sale_date' },
      { label: 'Orden ID', value: 'order_id' },
      { label: 'Ref. Externa', value: 'external_reference' },
      { label: 'Creador (Emisor)', value: 'creator_name' },
      { label: 'CUIT Creador', value: 'creator_cuit' },
      { label: 'Condición Fiscal', value: 'creator_tax_condition' },
      { label: 'Monto Total Bruto', value: 'total_order_amount' },
      { label: 'Comisión Pasarela (Fee)', value: 'gateway_fee' },
      { label: 'Retención IVA', value: 'iva_retenido' },
      { label: 'Retención IIBB Mza', value: 'iibb_mendoza' },
      { label: 'Total Impuestos Pasarela', value: 'total_gateway_tax' },
      { label: 'Comisión Crema (Bruta)', value: 'platform_gross_commission' },
      { label: 'IVA Comisión Crema', value: 'platform_tax_share' },
      { label: 'Ganancia Neta Crema', value: 'platform_net_commission' },
      { label: 'Moneda', value: 'currency' },
      { label: 'Estado', value: 'order_status' },
    ];

    const parser = new Parser({ fields });
    return parser.parse(flattenedData);
  }

  /**
   * REPORTE MAESTRO: Genera el CSV del Libro Mayor para Cierre Contable.
   * Cruza Ingresos (Ventas) y Egresos (Retiros de Plataforma) con desglose impositivo.
   */
  static async exportMonthlyLedgerToCSV(
    currency: string,
    from: string,
    to: string
  ): Promise<string> {
    const ledgerEntries = await adminRepository.getPlatformLedger(currency, from, to);

    const fields = [
      { label: 'Fecha', value: 'created_at' },
      { label: 'Tipo de Movimiento', value: 'entry_type' },
      { label: 'Descripción', value: 'description' },
      { label: 'Monto Bruto', value: 'amount' },
      { label: 'Impuesto Retenido (Tax)', value: 'tax_amount' },
      { label: 'Ganancia Neta Crema', value: 'net_gain' },
      { label: 'Moneda', value: 'currency' },
      { label: 'Admin Responsable', value: 'admin_name' },
      { label: 'Comprobante/Recibo', value: 'transaction_receipt' },
    ];

    const parser = new Parser({ fields });
    return parser.parse(ledgerEntries);
  }

  /**
   * Genera un CSV con el historial de reembolsos
   */
  static async exportRefundsToCSV(currency: string): Promise<string> {
    const refunds = await adminRepository.getRecentRefunds(currency, 1000); // Exportamos hasta los últimos 1000

    const fields = [
      { label: 'ID Reembolso', value: 'id' },
      { label: 'Orden ID', value: 'order_id' },
      { label: 'Ref. Externa', value: 'external_reference' },
      { label: 'Email Comprador', value: 'buyer_email' },
      { label: 'Monto', value: 'amount' },
      { label: 'Moneda', value: 'currency' },
      { label: 'Razón', value: 'reason' },
      { label: 'Fecha', value: 'created_at' },
    ];

    const parser = new Parser({ fields });
    return parser.parse(refunds);
  }

  /**
   * Genera un CSV con los retiros (payouts) para contabilidad
   */
  static async exportPayoutsToCSV(
    currency: string,
    status?: string,
    startDate?: string,
    endDate?: string
  ): Promise<string> {
    // Usamos el nuevo método con filtros
    const payouts = await payoutRepository.getForExport(currency, status, startDate, endDate);

    const fields = [
      { label: 'Fecha Solicitud', value: 'created_at' },
      { label: 'Fecha Procesado', value: 'processed_at' },
      { label: 'Usuario', value: 'fullname' },
      { label: 'Email', value: 'email' },
      { label: 'Monto', value: 'amount' },
      { label: 'Moneda', value: 'currency' },
      { label: 'Estado', value: 'status' },
      { label: 'Cuenta Destino', value: 'destination_account' },
      { label: 'ID Transacción Bancaria', value: 'transaction_receipt' },
      { label: 'Notas Admin', value: 'admin_notes' },
    ];

    const parser = new Parser({ fields });
    return parser.parse(payouts);
  }

  static async exportFinancialAuditCSV(currency: string): Promise<string> {
    const data = await adminRepository.getReconciliationDetail(currency);

    const fields = [
      { label: 'Orden ID', value: 'id' },
      { label: 'Monto Total', value: 'amount' },
      { label: 'Estado Liberación', value: 'balance_released' },
      { label: 'Fecha Compra', value: 'created_at' },
      { label: 'Fecha Liberación Est.', value: 'release_date' },
      { label: 'Garantía Expirada', value: 'guarantee_expired' },
    ];

    const parser = new Parser({ fields });
    return parser.parse(data);
  }

  /**
   * REPORTE LEC (I+D): Genera el reporte de inversión en conocimiento.
   * Cruza horas cargadas, proyectos y valor hora para justificar el beneficio fiscal.
   */
  static async exportLECAuditCSV(month: number, year: number): Promise<string> {
    const { systemRepository } = await import('../repositories/system.repository');

    // 1. Obtenemos métricas y valor hora
    const hourlyRateStr = await systemRepository.getSetting('internal_dev_hourly_rate', '30000');
    const hourlyRate = parseFloat(hourlyRateStr);
    const metrics = await adminRepository.getLECMetrics(month, year, hourlyRate);

    // 2. Aquí podrías obtener el detalle de logs si lo necesitas,
    // pero para el reporte ejecutivo de cumplimiento:
    const summaryData = [
      {
        periodo: `${month}/${year}`,
        total_horas: metrics.totalHours,
        valor_hora_ars: hourlyRate,
        inversion_total_ars: metrics.investmentValue,
        facturacion_plataforma_ars: metrics.revenue,
        ratio_cumplimiento: `${metrics.complianceRatio.toFixed(2)}%`,
        estado_lec: metrics.complianceRatio >= 3 ? 'CUMPLE' : 'PENDIENTE',
      },
    ];

    const fields = [
      { label: 'Período', value: 'periodo' },
      { label: 'Horas I+D', value: 'total_horas' },
      { label: 'Valor Hora (ARS)', value: 'valor_hora_ars' },
      { label: 'Inversión Valuada (ARS)', value: 'inversion_total_ars' },
      { label: 'Facturación Bruta (ARS)', value: 'facturacion_plataforma_ars' },
      { label: 'Ratio s/ Facturación', value: 'ratio_cumplimiento' },
      { label: 'Estado Ley 27.506', value: 'estado_lec' },
    ];

    const parser = new Parser({ fields });
    return parser.parse(summaryData);
  }
}
