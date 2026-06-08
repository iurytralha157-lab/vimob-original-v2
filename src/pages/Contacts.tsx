import { useState, useDeferredValue } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/card";
import { LeadDetailDialog } from "@/components/leads/LeadDetailDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableCell, TableHead, TableHeader, TableRow, TableBody } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  MoreHorizontal,
  Phone,
  Mail,
  ExternalLink,
  Download,
  Upload,
  ChevronDown,
  MessageCircle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Trash2,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Plus,
  ChevronsRight,
  Trophy,
  XCircle,
} from "lucide-react";
import { CreateLeadDialog } from "@/components/leads/CreateLeadDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useIsMobile } from "@/hooks/use-mobile";
import { ContactCard } from "@/components/contacts/ContactCard";
import { useStages } from "@/hooks/use-stages";
import { useOrganizationUsers } from "@/hooks/use-users";
import { useTags } from "@/hooks/use-tags";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { ImportContactsDialog } from "@/components/contacts/ImportContactsDialog";
import { TableSkeleton } from "@/components/contacts/TableSkeleton";
import { EmptyState } from "@/components/contacts/EmptyState";
import { useContactsList, type ContactListFilters } from "@/hooks/use-contacts-list";
import { exportContactsFiltered } from "@/lib/export-contacts";
import { useLead, useDeleteLead } from "@/hooks/use-leads";
import { ReentryBadge } from "@/components/leads/ReentryBadge";
import { useToast } from "@/hooks/use-toast";
import { SharedFilters } from "@/components/shared/SharedFilters";
import { useSharedFilters } from "@/hooks/use-shared-filters";

export default function Contacts() {
  const isMobile = useIsMobile();
  const { toast } = useToast();

  const {
    filters: sharedFilters,
    datePreset,
    setDatePreset,
    customDateRange,
    setCustomDateRange,
    setTeamId,
    userId: selectedAssignee,
    setUserId: setSelectedAssignee,
    tagId: selectedTag,
    setTagId: setSelectedTag,
    dealStatus: selectedDealStatus,
    setDealStatus: setSelectedDealStatus,
    source: selectedSource,
    setSource: setSelectedSource,
    campaignId,
    setCampaignId,
    adSetId,
    setAdSetId,
    adId,
    setAdId,
    searchQuery: search,
    setSearchQuery: setSearch,
    clearFilters,
    hasActiveFilters: hasSharedActiveFilters,
    dynamicSources,
    campaigns,
    adSets,
    ads,
    tags: allTagsFromHook,
    isLoadingSources,
    isLoadingCampaigns,
    isLoadingAdSets,
    isLoadingAds,
  } = useSharedFilters();

  const [selectedPipeline, setSelectedPipeline] = useState<string>("all");
  const [selectedStage, setSelectedStage] = useState<string>("all");

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [deleteContactId, setDeleteContactId] = useState<string | null>(null);
  const [pageInputValue, setPageInputValue] = useState("1");
  const [isExporting, setIsExporting] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [lostLeadsView, setLostLeadsView] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortBy, setSortBy] = useState<ContactListFilters["sortBy"]>("created_at");
  const [sortDir, setSortDir] = useState<ContactListFilters["sortDir"]>("desc");

  const PAGE_SIZE_OPTIONS = [5, 10, 30, 50, 100];

  const deferredSearch = useDeferredValue(search);
  const dateRange = sharedFilters.dateRange;
  const effectiveDealStatus = lostLeadsView ? "lost" : selectedDealStatus;

  const filters: ContactListFilters = {
    search: deferredSearch || undefined,
    teamId: sharedFilters.teamId || undefined,
    pipelineId: selectedPipeline !== "all" ? selectedPipeline : undefined,
    stageId: selectedStage !== "all" ? selectedStage : undefined,
    assigneeId:
      selectedAssignee && selectedAssignee !== "all" && selectedAssignee !== "unassigned" ? selectedAssignee : undefined,
    unassigned: selectedAssignee === "unassigned",
    tagId: selectedTag && selectedTag !== "all" ? selectedTag : undefined,
    source: selectedSource && selectedSource !== "all" ? selectedSource : undefined,
    campaignId: campaignId || undefined,
    adSetId: adSetId || undefined,
    adId: adId || undefined,
    dealStatus:
      effectiveDealStatus && effectiveDealStatus !== "all"
        ? (effectiveDealStatus as "open" | "won" | "lost")
        : undefined,
    createdFrom: dateRange ? dateRange.from.toISOString() : undefined,
    createdTo: dateRange ? dateRange.to.toISOString() : undefined,
    sortBy,
    sortDir,
    page,
    limit: pageSize,
  };

  const { data: contacts = [], isLoading } = useContactsList(filters);
  const { data: stages = [] } = useStages(selectedPipeline !== "all" ? selectedPipeline : undefined);
  const { data: users = [] } = useOrganizationUsers();
  const { data: tags = [] } = useTags();

  const { data: selectedLead } = useLead(selectedContactId);
  const deleteLead = useDeleteLead();

  const totalCount = contacts[0]?.total_count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  const sourceLabels: Record<string, string> = {
    manual: "Manual",
    meta: "Meta Ads",
    site: "Site",
  };

  const dealStatusConfig = {
    open: { label: "Aberto", icon: CircleDot, className: "bg-muted text-muted-foreground" },
    won: {
      label: "Ganho",
      icon: Trophy,
      className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
    },
    lost: {
      label: "Perdido",
      icon: XCircle,
      className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    },
  };

  const handleClearFilters = () => {
    clearFilters();
    setSelectedPipeline("all");
    setSelectedStage("all");
    setLostLeadsView(false);
    setPage(1);
  };

  const handleExport = async () => {
    setIsExporting(true);

    try {
      const count = await exportContactsFiltered({
        filters: {
          search: deferredSearch || undefined,
          teamId: sharedFilters.teamId || undefined,
          pipelineId: selectedPipeline !== "all" ? selectedPipeline : undefined,
          stageId: selectedStage !== "all" ? selectedStage : undefined,
          assigneeId: selectedAssignee !== "all" && selectedAssignee !== "unassigned" ? selectedAssignee : undefined,
          unassigned: selectedAssignee === "unassigned",
          tagId: selectedTag !== "all" ? selectedTag : undefined,
          source: selectedSource !== "all" ? selectedSource : undefined,
          campaignId: campaignId || undefined,
          adSetId: adSetId || undefined,
          adId: adId || undefined,
          dealStatus: effectiveDealStatus !== "all" ? effectiveDealStatus : undefined,
          createdFrom: dateRange ? dateRange.from.toISOString() : undefined,
          createdTo: dateRange ? dateRange.to.toISOString() : undefined,
        },
        filename: `contatos-${format(new Date(), "yyyy-MM-dd")}`,
      });

      toast({
        title: "Exportação concluída",
        description: `${count} contatos exportados com sucesso`,
      });
    } catch (error: any) {
      toast({
        title: "Erro na exportação",
        description: error.message || "Não foi possível exportar os contatos",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  const toggleSelectAll = () => {
    if (selectedIds.size === contacts.length && contacts.length > 0) {
      clearSelection();
    } else {
      setSelectedIds(new Set(contacts.map((contact: any) => contact.id)));
    }
  };

  const toggleSelectOne = (id: string) => {
    const newSet = new Set(selectedIds);

    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }

    setSelectedIds(newSet);
  };

  const handleBulkDelete = async () => {
    for (const id of selectedIds) {
      await deleteLead.mutateAsync(id);
    }

    clearSelection();
    setBulkDeleteDialogOpen(false);
  };

  const hasActiveFilters =
    search ||
    selectedPipeline !== "all" ||
    selectedStage !== "all" ||
    selectedAssignee !== "all" ||
    selectedTag !== "all" ||
    selectedSource !== "all" ||
    selectedDealStatus !== "all" ||
    lostLeadsView ||
    datePreset ||
    customDateRange;

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handleSort = (column: ContactListFilters["sortBy"]) => {
    if (sortBy === column) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortDir("desc");
    }

    setPage(1);
  };

  const handleToggleLostLeadsView = () => {
    setLostLeadsView((current) => !current);
    setPage(1);
  };

  const SortIcon = ({ column }: { column: ContactListFilters["sortBy"] }) => {
    if (sortBy !== column) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />;

    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const handleFilterChange =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setPage(1);
    };

  return (
    <AppLayout title="Contatos">
      <div className="space-y-6 animate-in relative">
        {isMobile ? (
          <div className="flex gap-2 items-center w-full">
            <Button
              data-tour="contacts-new"
              size="icon"
              onClick={() => setIsCreateDialogOpen(true)}
              className="shrink-0"
              title="Novo Lead"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <div data-tour="contacts-filters" className="min-w-0 flex-1">
              <SharedFilters
                datePreset={datePreset}
                onDatePresetChange={setDatePreset}
                customDateRange={customDateRange}
                onCustomDateRangeChange={setCustomDateRange}
                teamId={sharedFilters.teamId}
                onTeamChange={setTeamId}
                userId={selectedAssignee}
                onUserChange={setSelectedAssignee}
                source={selectedSource}
                onSourceChange={setSelectedSource}
                campaignId={sharedFilters.campaignId}
                onCampaignChange={setCampaignId}
                adSetId={sharedFilters.adSetId}
                onAdSetChange={setAdSetId}
                adId={sharedFilters.adId}
                onAdChange={setAdId}
                tagId={selectedTag}
                onTagChange={setSelectedTag}
                dealStatus={effectiveDealStatus}
                onDealStatusChange={(value) => {
                  setLostLeadsView(false);
                  setSelectedDealStatus(value);
                }}
                searchQuery={search}
                onSearchChange={setSearch}
                onClear={handleClearFilters}
                hasActiveFilters={hasSharedActiveFilters || selectedPipeline !== "all" || selectedStage !== "all" || lostLeadsView}
                dynamicSources={dynamicSources}
                campaigns={campaigns}
                adSets={adSets}
                ads={ads}
                tags={allTagsFromHook}
                isLoadingSources={isLoadingSources}
                isLoadingCampaigns={isLoadingCampaigns}
                isLoadingAdSets={isLoadingAdSets}
                isLoadingAds={isLoadingAds}
                datePosition="end"
              />
            </div>

            <Button
              data-tour="contacts-lost"
              variant={lostLeadsView ? "destructive" : "outline"}
              size="icon"
              className="shrink-0"
              onClick={handleToggleLostLeadsView}
              title={lostLeadsView ? "Voltar para todos os leads" : "Leads perdidos"}
            >
              <XCircle className="h-4 w-4" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button data-tour="contacts-import" variant="outline" size="icon" className="shrink-0">
                  <Upload className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => setImportDialogOpen(true)} className="py-2.5">
                  <Upload className="h-4 w-4 mr-2 text-primary" />
                  Importar CSV/Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExport} disabled={isExporting || totalCount === 0} className="py-2.5">
                  <Download className="h-4 w-4 mr-2 text-primary" />
                  {isExporting ? "Exportando..." : "Exportar Lista"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <div className="bg-card rounded-xl p-1.5 px-3 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between gap-3 w-full">
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button data-tour="contacts-import" variant="outline" size="sm" className="h-9 gap-2 font-medium border-none hover:bg-muted">
                      <Upload className="h-4 w-4" />
                      <span className="hidden xl:inline">Importar / Exportar</span>
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => setImportDialogOpen(true)} className="py-2.5">
                      <Upload className="h-4 w-4 mr-2 text-primary" />
                      Importar CSV/Excel
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handleExport}
                      disabled={isExporting || totalCount === 0}
                      className="py-2.5"
                    >
                      <Download className="h-4 w-4 mr-2 text-primary" />
                      {isExporting ? "Exportando..." : "Exportar Lista"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  data-tour="contacts-lost"
                  variant={lostLeadsView ? "destructive" : "outline"}
                  size="sm"
                  onClick={handleToggleLostLeadsView}
                  className="h-9 gap-2 font-medium"
                >
                  <XCircle className="h-4 w-4" />
                  <span>Leads perdidos</span>
                </Button>
              </div>

              <div className="flex min-w-0 items-center justify-end gap-2">
                <Button
                  data-tour="contacts-new"
                  size="sm"
                  onClick={() => setIsCreateDialogOpen(true)}
                  className="h-9 gap-2 shadow-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" />
                  <span>Novo Lead</span>
                </Button>

                <div data-tour="contacts-filters">
                  <SharedFilters
                    datePreset={datePreset || "last30days"}
                    onDatePresetChange={handleFilterChange(setDatePreset)}
                    customDateRange={customDateRange}
                    onCustomDateRangeChange={handleFilterChange(setCustomDateRange)}
                    teamId={sharedFilters.teamId}
                    onTeamChange={handleFilterChange(setTeamId)}
                    userId={selectedAssignee}
                    onUserChange={handleFilterChange(setSelectedAssignee)}
                    source={selectedSource}
                    onSourceChange={handleFilterChange(setSelectedSource)}
                    campaignId={sharedFilters.campaignId}
                    onCampaignChange={handleFilterChange(setCampaignId)}
                    adSetId={sharedFilters.adSetId}
                    onAdSetChange={handleFilterChange(setAdSetId)}
                    adId={sharedFilters.adId}
                    onAdChange={handleFilterChange(setAdId)}
                    tagId={selectedTag}
                    onTagChange={handleFilterChange(setSelectedTag)}
                    dealStatus={effectiveDealStatus}
                    onDealStatusChange={(value) => {
                      setLostLeadsView(false);
                      handleFilterChange(setSelectedDealStatus)(value);
                    }}
                    searchQuery={search}
                    onSearchChange={(value) => {
                      setSearch(value);
                      setPage(1);
                    }}
                    onClear={handleClearFilters}
                    hasActiveFilters={hasSharedActiveFilters || selectedPipeline !== "all" || selectedStage !== "all" || lostLeadsView}
                    dynamicSources={dynamicSources}
                    campaigns={campaigns}
                    adSets={adSets}
                    ads={ads}
                    tags={allTagsFromHook}
                    isLoadingSources={isLoadingSources}
                    isLoadingCampaigns={isLoadingCampaigns}
                    isLoadingAdSets={isLoadingAdSets}
                    isLoadingAds={isLoadingAds}
                    datePosition="end"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {lostLeadsView && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500 text-white">
                  <XCircle className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-red-700 dark:text-red-300">Leads perdidos</h2>
                  <p className="text-xs text-muted-foreground">
                    Listando leads marcados como perdidos e o motivo informado na perda.
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={handleToggleLostLeadsView} className="h-8 text-xs">
                Ver todos os leads
              </Button>
            </div>
          </div>
        )}

        <Card data-tour="contacts-list">
          {isMobile ? (
            <div>
              {isLoading ? (
                <div className="divide-y">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="p-4 space-y-3 animate-pulse">
                      <div className="flex justify-between">
                        <div className="space-y-2 flex-1">
                          <div className="h-4 w-32 bg-muted rounded" />
                          <div className="h-3 w-24 bg-muted rounded" />
                        </div>
                        <div className="h-8 w-8 bg-muted rounded" />
                      </div>
                      <div className="flex gap-2">
                        <div className="h-6 w-20 bg-muted rounded-full" />
                        <div className="h-6 w-16 bg-muted rounded-full" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : contacts.length === 0 ? (
                <EmptyState
                  hasActiveFilters={!!hasActiveFilters}
                  onImport={() => setImportDialogOpen(true)}
                  onCreate={() => setIsCreateDialogOpen(true)}
                  onClearFilters={clearFilters}
                />
              ) : (
                <div className="divide-y">
                  {contacts.map((contact: any) => (
                    <ContactCard
                      key={contact.id}
                      contact={contact}
                      sourceLabels={sourceLabels}
                      onViewDetails={() => setSelectedContactId(contact.id)}
                      onDelete={() => setDeleteContactId(contact.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              {isLoading ? (
                <TableSkeleton />
              ) : contacts.length === 0 ? (
                <EmptyState
                  hasActiveFilters={!!hasActiveFilters}
                  onImport={() => setImportDialogOpen(true)}
                  onCreate={() => setIsCreateDialogOpen(true)}
                  onClearFilters={clearFilters}
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={selectedIds.size === contacts.length && contacts.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("name")}>
                        <div className="flex items-center">
                          Nome <SortIcon column="name" />
                        </div>
                      </TableHead>
                      <TableHead>Contato</TableHead>
                      <TableHead>{lostLeadsView ? "Motivo da perda" : "Status"}</TableHead>
                      <TableHead>Pipeline / Estágio</TableHead>
                      <TableHead>Responsável</TableHead>
                      <TableHead>Tags</TableHead>
                      <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("created_at")}>
                        <div className="flex items-center">
                          Criado em <SortIcon column="created_at" />
                        </div>
                      </TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {contacts.map((contact: any) => {
                      const isLost = contact.deal_status === "lost";
                      const isWon = contact.deal_status === "won";
                      const status = contact.deal_status || "open";
                      const StatusIcon = dealStatusConfig[status]?.icon || CircleDot;

                      return (
                        <TableRow
                          key={contact.id}
                          className={cn(
                            "cursor-pointer hover:bg-muted/30",
                            isLost && "bg-red-50/50 dark:bg-red-950/20 hover:bg-red-100/50 dark:hover:bg-red-950/30",
                            isWon &&
                              "bg-emerald-50/50 dark:bg-emerald-950/20 hover:bg-emerald-100/50 dark:hover:bg-emerald-950/30",
                          )}
                          onClick={() => setSelectedContactId(contact.id)}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedIds.has(contact.id)}
                              onCheckedChange={() => toggleSelectOne(contact.id)}
                            />
                          </TableCell>

                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-9 w-9">
                                <AvatarImage src={contact.whatsapp_avatar_url || undefined} alt={contact.name} />
                                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                                  {getInitials(contact.name)}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-foreground">{contact.name}</p>
                                  <ReentryBadge count={contact.reentry_count} lastEntryAt={contact.last_entry_at} />
                                </div>
                                {contact.source && (
                                  <p className="text-xs text-muted-foreground">
                                    {sourceLabels[contact.source] || contact.source}
                                  </p>
                                )}
                              </div>
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="space-y-1">
                              {contact.phone && (
                                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                  <Phone className="h-3 w-3" />
                                  {contact.phone}
                                </div>
                              )}
                              {contact.email && (
                                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                  <Mail className="h-3 w-3" />
                                  {contact.email}
                                </div>
                              )}
                            </div>
                          </TableCell>

                          <TableCell onClick={() => setSelectedContactId(contact.id)}>
                            {lostLeadsView ? (
                              <p
                                className="max-w-[260px] text-sm font-medium text-red-700 dark:text-red-300"
                                title={contact.lost_reason || undefined}
                              >
                                {contact.lost_reason || "Motivo não informado"}
                              </p>
                            ) : (
                              <div className="space-y-1">
                                <Badge
                                  variant="secondary"
                                  className={cn("text-xs gap-1 px-2", dealStatusConfig[status]?.className)}
                                >
                                  <StatusIcon className="h-3 w-3" />
                                  {dealStatusConfig[status]?.label}
                                </Badge>
                                {isLost && contact.lost_reason && (
                                  <p
                                    className="text-xs text-red-600 dark:text-red-400 max-w-[150px] truncate"
                                    title={contact.lost_reason}
                                  >
                                    {contact.lost_reason}
                                  </p>
                                )}
                              </div>
                            )}
                          </TableCell>

                          <TableCell onClick={() => setSelectedContactId(contact.id)}>
                            <div className="space-y-1">
                              {contact.stage_name && (
                                <Badge variant="outline" className="text-xs">
                                  {contact.stage_name}
                                </Badge>
                              )}
                            </div>
                          </TableCell>

                          <TableCell onClick={() => setSelectedContactId(contact.id)}>
                            {contact.assignee_name ? (
                              <div className="flex items-center gap-2">
                                <Avatar className="h-6 w-6">
                                  <AvatarImage src={contact.assignee_avatar || undefined} />
                                  <AvatarFallback className="text-[10px] bg-secondary">
                                    {getInitials(contact.assignee_name)}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-sm">{contact.assignee_name}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">Sem responsável</span>
                            )}
                          </TableCell>

                          <TableCell onClick={() => setSelectedContactId(contact.id)}>
                            <div className="flex flex-wrap gap-1">
                              {contact.tags?.slice(0, 2).map((tag: any) => (
                                <Badge
                                  key={tag.id}
                                  variant="secondary"
                                  className="text-[10px] px-1.5"
                                  style={{
                                    backgroundColor: tag.color,
                                    color: "#FFFFFF",
                                    borderColor: tag.color,
                                  }}
                                >
                                  {tag.name}
                                </Badge>
                              ))}
                              {contact.tags && contact.tags.length > 2 && (
                                <Badge variant="secondary" className="text-[10px] px-1.5">
                                  +{contact.tags.length - 2}
                                </Badge>
                              )}
                            </div>
                          </TableCell>

                          <TableCell onClick={() => setSelectedContactId(contact.id)}>
                            <div className="text-sm">
                              <p>{format(new Date(contact.created_at), "dd/MM/yyyy", { locale: ptBR })}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(contact.created_at), { addSuffix: true, locale: ptBR })}
                              </p>
                            </div>
                          </TableCell>

                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setSelectedContactId(contact.id)}>
                                  <ExternalLink className="h-4 w-4 mr-2" />
                                  Ver detalhes
                                </DropdownMenuItem>
                                {contact.phone && (
                                  <DropdownMenuItem asChild>
                                    <a
                                      href={`https://wa.me/${contact.phone.replace(/\D/g, "")}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      <MessageCircle className="h-4 w-4 mr-2" />
                                      WhatsApp
                                    </a>
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setDeleteContactId(contact.id)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Excluir
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          )}
        </Card>

        {selectedIds.size > 0 && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-background border rounded-lg shadow-lg p-3 flex items-center gap-4 z-50">
            <span className="text-sm font-medium">{selectedIds.size} selecionado(s)</span>
            <Button variant="destructive" size="sm" onClick={() => setBulkDeleteDialogOpen(true)}>
              <Trash2 className="h-4 w-4 mr-1" />
              Excluir
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              Cancelar
            </Button>
          </div>
        )}

        {(totalPages > 1 || totalCount > 0) && (
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">
                Página {page} de {totalPages || 1}
              </p>
              <Select
                value={String(pageSize)}
                onValueChange={(value) => {
                  setPageSize(Number(value));
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size} por pág
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage(1)}
                disabled={page === 1}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <div className="flex items-center gap-1 mx-2">
                <Input
                  type="text"
                  value={pageInputValue}
                  onChange={(e) => setPageInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const pageNumber = parseInt(pageInputValue);

                      if (!isNaN(pageNumber) && pageNumber >= 1 && pageNumber <= totalPages) {
                        setPage(pageNumber);
                      } else {
                        setPageInputValue(String(page));
                      }
                    }
                  }}
                  onBlur={() => {
                    const pageNumber = parseInt(pageInputValue);

                    if (!isNaN(pageNumber) && pageNumber >= 1 && pageNumber <= totalPages) {
                      setPage(pageNumber);
                    } else {
                      setPageInputValue(String(page));
                    }
                  }}
                  className="w-12 h-8 text-center p-1"
                />
                <span className="text-sm text-muted-foreground">/ {totalPages}</span>
              </div>

              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
                disabled={page === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {selectedLead && (
          <LeadDetailDialog
            lead={selectedLead}
            stages={stages}
            onClose={() => setSelectedContactId(null)}
            allTags={tags}
            allUsers={users}
            refetchStages={() => {}}
          />
        )}

        <CreateLeadDialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen} />

        <AlertDialog open={!!deleteContactId} onOpenChange={(open) => !open && setDeleteContactId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir contato</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir este contato? Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90"
                onClick={async () => {
                  if (deleteContactId) {
                    await deleteLead.mutateAsync(deleteContactId);
                    setDeleteContactId(null);
                  }
                }}
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir {selectedIds.size} contatos</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir {selectedIds.size} contatos selecionados? Esta ação não pode ser
                desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={handleBulkDelete}>
                Excluir {selectedIds.size} contatos
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <ImportContactsDialog open={importDialogOpen} onOpenChange={setImportDialogOpen} />
      </div>
    </AppLayout>
  );
}
