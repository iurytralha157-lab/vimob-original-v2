import { useState, useEffect } from "react";
import { Users, User, Globe, X, SlidersHorizontal, Facebook, Search, Tag as TagIcon, CircleDot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useTeams } from "@/hooks/use-teams";
import { useOrganizationUsers } from "@/hooks/use-users";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useUserPermissions } from "@/hooks/use-user-permissions";
import { DatePreset } from "@/hooks/use-dashboard-filters";
import { DateFilterPopover } from "@/components/ui/date-filter-popover";

interface SharedFiltersProps {
  datePreset: DatePreset;
  onDatePresetChange: (preset: DatePreset) => void;
  customDateRange: { from: Date; to: Date } | null;
  onCustomDateRangeChange: (range: { from: Date; to: Date } | null) => void;

  teamId: string | null;
  onTeamChange: (teamId: string | null) => void;
  userId: string | null;
  onUserChange: (userId: string | null) => void;

  source: string | null;
  onSourceChange: (source: string | null) => void;
  dynamicSources?: { value: string; label: string }[];
  isLoadingSources?: boolean;

  campaignId: string | null;
  onCampaignChange: (id: string | null) => void;
  adSetId: string | null;
  onAdSetChange: (id: string | null) => void;
  adId: string | null;
  onAdChange: (id: string | null) => void;
  campaigns?: { id: string; name: string }[];
  adSets?: { id: string; name: string }[];
  ads?: { id: string; name: string }[];
  isLoadingCampaigns?: boolean;
  isLoadingAdSets?: boolean;
  isLoadingAds?: boolean;

  tagId: string | null;
  onTagChange: (tagId: string | null) => void;
  tags?: { id: string; name: string; color: string }[];

  dealStatus: string | null;
  onDealStatusChange: (status: string | null) => void;

  searchQuery: string;
  onSearchChange: (query: string) => void;

  onClear: () => void;
  hasActiveFilters: boolean;
  hideSearch?: boolean;
}

export function SharedFilters({
  datePreset,
  onDatePresetChange,
  customDateRange,
  onCustomDateRangeChange,
  teamId,
  onTeamChange,
  userId,
  onUserChange,
  source,
  onSourceChange,
  campaignId,
  onCampaignChange,
  adSetId,
  onAdSetChange,
  adId,
  onAdChange,
  tagId,
  onTagChange,
  dealStatus,
  onDealStatusChange,
  searchQuery,
  onSearchChange,
  onClear,
  hasActiveFilters,
  dynamicSources = [],
  campaigns = [],
  adSets = [],
  ads = [],
  tags = [],
  isLoadingSources = false,
  isLoadingCampaigns = false,
  isLoadingAdSets = false,
  isLoadingAds = false,
  hideSearch = false,
}: SharedFiltersProps) {
  const { user, profile } = useAuth();
  const { data: teams = [] } = useTeams();
  const { data: users = [] } = useOrganizationUsers();
  const isMobile = useIsMobile();
  const { hasPermission } = useUserPermissions();

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState(searchQuery);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== searchQuery) {
        onSearchChange(localSearch);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [localSearch]);

  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";
  const canViewAllLeads = isAdmin || hasPermission("lead_view_all");

  const isTeamLeader = teams.some((team) =>
    team.members?.some((member) => member.user_id === user?.id && member.is_leader),
  );

  const showUserFilter = canViewAllLeads || isTeamLeader;

  const availableTeams = isAdmin
    ? teams
    : teams.filter((team) => team.members?.some((member) => member.user_id === user?.id && member.is_leader));

  const availableUsers = teamId
    ? users.filter((availableUser) => {
        const team = teams.find((item) => item.id === teamId);
        return team?.members?.some((member) => member.user_id === availableUser.id);
      })
    : users;

  const hasExtraFilters =
    teamId !== null ||
    (userId !== null && userId !== "all") ||
    source !== null ||
    campaignId !== null ||
    adSetId !== null ||
    adId !== null ||
    tagId !== null ||
    dealStatus !== null ||
    searchQuery !== "";

  const TeamFilter = () =>
    availableTeams.length > 0 ? (
      <Select
        value={teamId || "all"}
        onValueChange={(value) => {
          onTeamChange(value === "all" ? null : value);
          onUserChange(null);
        }}
      >
        <SelectTrigger className={cn("h-9 w-full text-xs", teamId && "border-primary text-primary")}>
          <Users className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
          <SelectValue placeholder="Equipe" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas equipes</SelectItem>
          {availableTeams.map((team) => (
            <SelectItem key={team.id} value={team.id}>
              {team.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : null;

  const UserFilter = () => (
    <Select value={userId || "all"} onValueChange={(value) => onUserChange(value === "all" ? null : value)}>
      <SelectTrigger className={cn("h-9 w-full text-xs", userId && userId !== "all" && "border-primary text-primary")}>
        <User className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
        <SelectValue placeholder="Corretor" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todos</SelectItem>
        {availableUsers.map((availableUser) => (
          <SelectItem key={availableUser.id} value={availableUser.id}>
            {availableUser.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const SourceFilter = () => (
    <Select value={source || "all"} onValueChange={(value) => onSourceChange(value === "all" ? null : value)}>
      <SelectTrigger className={cn("h-9 w-full text-xs", source && "border-primary text-primary")}>
        <Globe className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
        <SelectValue placeholder={isLoadingSources ? "Carregando..." : "Origem"} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todas origens</SelectItem>
        {dynamicSources.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const TagFilter = () => (
    <Select value={tagId || "all"} onValueChange={(value) => onTagChange(value === "all" ? null : value)}>
      <SelectTrigger className={cn("h-9 w-full text-xs", tagId && "border-primary text-primary")}>
        <TagIcon className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
        <SelectValue placeholder="Tag" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todas tags</SelectItem>
        {tags.map((tag) => (
          <SelectItem key={tag.id} value={tag.id}>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />
              {tag.name}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const DealStatusFilter = () => (
    <Select value={dealStatus || "all"} onValueChange={(value) => onDealStatusChange(value === "all" ? null : value)}>
      <SelectTrigger className={cn("h-9 w-full text-xs", dealStatus && "border-primary text-primary")}>
        <CircleDot className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
        <SelectValue placeholder="Status" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todos status</SelectItem>
        <SelectItem value="open">Aberto</SelectItem>
        <SelectItem value="won">Ganho</SelectItem>
        <SelectItem value="lost">Perdido</SelectItem>
      </SelectContent>
    </Select>
  );

  const MetaFilters = () => (
    <div className="space-y-2">
      <div className="space-y-1">
        <Select
          value={campaignId || "all"}
          onValueChange={(value) => {
            onCampaignChange(value === "all" ? null : value);
          }}
        >
          <SelectTrigger className="h-8 text-xs bg-background/50 border-border/40">
            <SelectValue placeholder={isLoadingCampaigns ? "Carregando..." : "Todas campanhas"} />
          </SelectTrigger>
          <SelectContent className="z-[120]">
            <SelectItem value="all">Todas campanhas</SelectItem>
            {campaigns.map((campaign) => (
              <SelectItem key={campaign.id} value={campaign.id}>
                {campaign.name}
              </SelectItem>
            ))}
            {!isLoadingCampaigns && campaigns.length === 0 && (
              <div className="p-2 text-[10px] text-center text-muted-foreground">Nenhuma campanha no período</div>
            )}
          </SelectContent>
        </Select>
      </div>

      {campaignId && (
        <div className="space-y-1">
          <Select
            value={adSetId || "all"}
            onValueChange={(value) => {
              onAdSetChange(value === "all" ? null : value);
            }}
          >
            <SelectTrigger className="h-8 text-xs bg-background/50 border-border/40 animate-in fade-in slide-in-from-top-1">
              <SelectValue placeholder={isLoadingAdSets ? "Carregando..." : "Todos conjuntos"} />
            </SelectTrigger>
            <SelectContent className="z-[120]">
              <SelectItem value="all">Todos conjuntos</SelectItem>
              {adSets.map((adSet) => (
                <SelectItem key={adSet.id} value={adSet.id}>
                  {adSet.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {adSetId && (
        <div className="space-y-1">
          <Select value={adId || "all"} onValueChange={(value) => onAdChange(value === "all" ? null : value)}>
            <SelectTrigger className="h-8 text-xs bg-background/50 border-border/40 animate-in fade-in slide-in-from-top-1">
              <SelectValue placeholder={isLoadingAds ? "Carregando..." : "Todos criativos"} />
            </SelectTrigger>
            <SelectContent className="z-[120]">
              <SelectItem value="all">Todos criativos</SelectItem>
              {ads.map((ad) => (
                <SelectItem key={ad.id} value={ad.id}>
                  {ad.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );

  const FilterContent = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between border-b border-border/40 pb-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Filtros Avançados</span>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="h-5 px-1.5 text-[9px] uppercase font-bold text-primary hover:bg-primary/10"
          >
            Limpar
          </Button>
        )}
      </div>

      <div className="grid gap-2">
        {!hideSearch && (
          <div className="relative group">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground group-focus-within:text-primary" />
            <Input
              placeholder="Buscar..."
              value={localSearch}
              onChange={(event) => setLocalSearch(event.target.value)}
              onKeyDown={(event) => {
                event.stopPropagation();
              }}
              onKeyUp={(event) => {
                event.stopPropagation();
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
              }}
              autoComplete="off"
              className="h-9 pl-8 text-xs bg-muted/30 border-border/50 focus:bg-background"
            />
          </div>
        )}

        {availableTeams.length > 0 && <TeamFilter />}

        {showUserFilter && <UserFilter />}

        <SourceFilter />

        <TagFilter />

        <DealStatusFilter />

        <div className="space-y-2 pt-2 border-t border-border/40">
          <div className="flex items-center gap-1.5 px-1 mb-1">
            <Facebook className="h-3 w-3 text-[#1877F2]" />
            <span className="text-[10px] font-bold text-muted-foreground">CAMPANHAS META</span>
          </div>
          <MetaFilters />
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex items-center justify-end gap-2 w-full">
      <div className="flex items-center">
        <DateFilterPopover
          datePreset={datePreset}
          onDatePresetChange={onDatePresetChange}
          customDateRange={customDateRange}
          onCustomDateRangeChange={onCustomDateRangeChange}
          triggerClassName={cn(
            "h-8 gap-2 text-[11px] font-semibold uppercase tracking-wider px-3 border-border/60 hover:border-primary/50 transition-colors",
            isMobile ? "px-2 text-xs font-medium normal-case tracking-normal" : "",
            (datePreset !== "last30days" || customDateRange) && "border-primary/50 bg-primary/5 text-primary",
          )}
          align="end"
        />
      </div>

      <div className="flex items-center gap-1">
        <Popover open={filtersOpen} onOpenChange={setFiltersOpen} modal={true}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-8 gap-2 text-[11px] font-semibold uppercase tracking-wider px-3 border-border/60 hover:border-primary/50 transition-colors",
                isMobile ? "px-2.5 text-xs font-medium normal-case tracking-normal" : "",
                hasExtraFilters && "border-primary/50 bg-primary/5 text-primary",
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span className={isMobile ? "hidden xs:inline" : ""}>Filtros</span>
              {hasExtraFilters && (
                <Badge
                  variant="default"
                  className={cn(
                    "ml-1 h-4 min-w-[16px] px-1 text-[9px] bg-primary flex items-center justify-center",
                    isMobile && "h-4 w-4 p-0 text-[10px] ml-0.5",
                  )}
                >
                  {isMobile ? "•" : "!"}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>

          <PopoverContent
            align="end"
            onOpenAutoFocus={(event) => event.preventDefault()}
            className={cn("w-72 p-3 border-border/40 shadow-2xl", isMobile && "w-[280px] max-h-[80vh] overflow-y-auto")}
          >
            {FilterContent()}
          </PopoverContent>
        </Popover>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-muted-foreground hover:text-destructive transition-colors"
            onClick={onClear}
            title="Limpar todos os filtros"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
