import ExcelJS from 'exceljs';
import { supabase } from '@/integrations/supabase/client';
import { format as formatDate } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ExportFilters {
  search?: string;
  pipelineId?: string;
  stageId?: string;
  assigneeId?: string;
  unassigned?: boolean;
  tagId?: string;
  source?: string;
  dealStatus?: string;
  createdFrom?: string;
  createdTo?: string;
}

interface ExportOptions {
  filters?: ExportFilters;
  filename?: string;
  exportFormat?: 'xlsx' | 'csv';
}

const sourceLabels: Record<string, string> = {
  manual: 'Manual',
  meta: 'Meta Ads',
  site: 'Site',
  wordpress: 'WordPress',
  website: 'Website',
};

const dealStatusLabels: Record<string, string> = {
  open: 'Aberto',
  won: 'Ganho',
  lost: 'Perdido',
};

export async function exportContactsFiltered({ 
  filters = {}, 
  filename = 'contatos', 
  exportFormat = 'xlsx' 
}: ExportOptions) {
  // Fetch all contacts matching filters via RPC (up to 10000)
  const { data, error } = await (supabase as any).rpc('list_contacts_paginated', {
    p_search: filters.search || null,
    p_pipeline_id: filters.pipelineId || null,
    p_stage_id: filters.stageId || null,
    p_assignee_id: filters.unassigned ? null : (filters.assigneeId || null),
    p_unassigned: filters.unassigned || false,
    p_tag_id: filters.tagId || null,
    p_source: filters.source || null,
    p_deal_status: filters.dealStatus || null,
    p_created_from: filters.createdFrom || null,
    p_created_to: filters.createdTo || null,
    p_sort_by: 'created_at',
    p_sort_dir: 'desc',
    p_page: 1,
    p_limit: 10000, // Export all matching records
  });

  if (error) {
    console.error('Error fetching contacts for export:', error);
    throw error;
  }

  const contacts = Array.isArray(data) ? data : [];
  
  if (contacts.length === 0) {
    throw new Error('Nenhum contato encontrado para exportar');
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Contatos');

  // Define headers
  worksheet.columns = [
    { header: 'Nome', key: 'nome', width: 25 },
    { header: 'Telefone', key: 'telefone', width: 18 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Pipeline', key: 'pipeline', width: 20 },
    { header: 'Estágio', key: 'estagio', width: 20 },
    { header: 'Responsável', key: 'responsavel', width: 20 },
    { header: 'Tags', key: 'tags', width: 25 },
    { header: 'Fonte', key: 'fonte', width: 15 },
    { header: 'Motivo Perda', key: 'motivo_perda', width: 30 },
    { header: 'Última Interação', key: 'ultima_interacao', width: 18 },
    { header: 'Data de Criação', key: 'criacao', width: 18 },
  ];

  // Add data rows
  contacts.forEach((contact: any) => {
    const tags = Array.isArray(contact.tags) ? contact.tags : [];
    worksheet.addRow({
      nome: contact.name,
      telefone: contact.phone || '',
      email: contact.email || '',
      status: dealStatusLabels[contact.deal_status] || 'Aberto',
      pipeline: contact.pipeline_name || '',
      estagio: contact.stage_name || '',
      responsavel: contact.assignee_name || '',
      tags: tags.map((t: any) => t.name).join(', '),
      fonte: sourceLabels[contact.source] || contact.source,
      motivo_perda: contact.lost_reason || '',
      ultima_interacao: contact.last_interaction_at 
        ? formatDate(new Date(contact.last_interaction_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })
        : '',
      criacao: formatDate(new Date(contact.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }),
    });
  });

  // Style header row
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE2E8F0' }
  };

  // Generate and download file
  if (exportFormat === 'csv') {
    const buffer = await workbook.csv.writeBuffer();
    downloadFile(buffer, `${filename}.csv`, 'text/csv;charset=utf-8;');
  } else {
    const buffer = await workbook.xlsx.writeBuffer();
    downloadFile(buffer, `${filename}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  return contacts.length;
}

function downloadFile(buffer: ExcelJS.Buffer, filename: string, mimeType: string) {
  const blob = new Blob([buffer], { type: mimeType });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

// Keep legacy function for backwards compatibility
export async function exportContacts({ leads, filename = 'contatos', exportFormat = 'xlsx' }: { 
  leads: any[]; 
  filename?: string; 
  exportFormat?: 'xlsx' | 'csv'; 
}) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Contatos');

  worksheet.columns = [
    { header: 'Nome', key: 'nome', width: 25 },
    { header: 'Telefone', key: 'telefone', width: 18 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Estágio', key: 'estagio', width: 20 },
    { header: 'Responsável', key: 'responsavel', width: 20 },
    { header: 'Tags', key: 'tags', width: 25 },
    { header: 'Fonte', key: 'fonte', width: 15 },
    { header: 'Mensagem', key: 'mensagem', width: 40 },
    { header: 'Data de Criação', key: 'criacao', width: 18 },
  ];

  leads.forEach(lead => {
    worksheet.addRow({
      nome: lead.name,
      telefone: lead.phone || '',
      email: lead.email || '',
      estagio: lead.stage?.name || '',
      responsavel: lead.assignee?.name || '',
      tags: (lead.tags || []).map((t: any) => t.name).join(', '),
      fonte: sourceLabels[lead.source] || lead.source,
      mensagem: lead.message || '',
      criacao: formatDate(new Date(lead.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }),
    });
  });

  worksheet.getRow(1).font = { bold: true };

  if (exportFormat === 'csv') {
    const buffer = await workbook.csv.writeBuffer();
    downloadFile(buffer, `${filename}.csv`, 'text/csv;charset=utf-8;');
  } else {
    const buffer = await workbook.xlsx.writeBuffer();
    downloadFile(buffer, `${filename}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }
}
