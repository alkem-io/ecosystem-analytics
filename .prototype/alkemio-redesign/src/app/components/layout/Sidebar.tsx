import { useState } from "react";
import { 
  Home, Users, Plus, Settings, Mail, Eye, 
  LayoutDashboard, FolderOpen, ChevronsLeft, ChevronsRight, Library 
} from "lucide-react";
import { Link, useLocation } from "react-router";
import { cn } from "@/lib/utils";
import { Switch } from "@/app/components/ui/switch";
import { Label } from "@/app/components/ui/label";
import { Button } from "@/app/components/ui/button";

import { InvitationsDialog } from "@/app/components/dialogs/InvitationsDialog";

import AlkemioLogo from "@/imports/AlkemioLogo";
import AlkemioSymbolSquare from "@/imports/AlkemioSymbolSquare";

export function Sidebar({ className }: { className?: string }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showInvitations, setShowInvitations] = useState(false);
  const location = useLocation();

  const navItems = [
    { icon: Home, label: "Dashboard", href: "/" },
    { icon: FolderOpen, label: "Browse All Spaces", href: "/spaces" },
    { icon: Library, label: "Template Library", href: "/templates" },
    { icon: Plus, label: "Create Space", href: "/create-space" },
    { icon: Mail, label: "Invitations", onClick: () => setShowInvitations(true), badge: 2 },
  ];

  const spaces = [
    { name: "Innovation Hub", initials: "IH", color: "bg-blue-500/10 text-blue-500", href: "/space/innovation-hub" },
    { name: "Community Garden", initials: "CG", color: "bg-green-500/10 text-green-500", href: "/space/community-garden" },
    { name: "Digital Transformation", initials: "DT", color: "bg-purple-500/10 text-purple-500", href: "/space/digital-trans" },
  ];

  return (
    <aside 
      className={cn(
        "bg-sidebar border-r border-sidebar-border flex flex-col h-screen sticky top-0 transition-[width] duration-300 ease-in-out z-30 group/sidebar", 
        isCollapsed ? "w-[80px]" : "w-64",
        className
      )}
    >
      {/* Collapse Toggle Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-6 h-6 w-6 rounded-full border border-border shadow-md bg-sidebar text-sidebar-foreground p-0 z-50 hover:bg-sidebar-accent hidden md:flex"
      >
        {isCollapsed ? <ChevronsRight className="w-3 h-3" /> : <ChevronsLeft className="w-3 h-3" />}
      </Button>

      <div className="h-16 relative flex items-center border-b border-sidebar-border/50 bg-sidebar overflow-hidden shrink-0">
        {/* Full Logo - Visible when expanded */}
        <div 
          className={cn(
            "absolute left-6 top-1/2 -translate-y-1/2 transition-all duration-300 ease-in-out",
            isCollapsed 
              ? "opacity-0 -translate-x-4 pointer-events-none scale-95" 
              : "opacity-100 translate-x-0 scale-100 delay-100"
          )}
        >
          <div className="w-[180px] h-[24px]">
             <AlkemioLogo />
          </div>
        </div>

        {/* Symbol Logo - Visible when collapsed */}
        <div 
          className={cn(
            "absolute left-0 w-full flex justify-center top-1/2 -translate-y-1/2 transition-all duration-300 ease-in-out",
            isCollapsed 
              ? "opacity-100 scale-100 delay-100" 
              : "opacity-0 scale-75 rotate-[-15deg] pointer-events-none"
          )}
        >
          <div className="w-9 h-9">
             <AlkemioSymbolSquare />
          </div>
        </div>
      </div>

      <div className="flex-1 py-6 px-4 space-y-6 overflow-y-auto overflow-x-hidden">
        <div className="space-y-1">
          {navItems.map((item) => {
            const commonClasses = cn(
              "flex items-center rounded-md text-sm font-medium transition-colors h-10 w-full",
              isCollapsed ? "justify-center px-0" : "justify-between px-3",
              item.href && location.pathname === item.href
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            );

            const content = (
              <>
                <div className="flex items-center gap-3">
                  <item.icon className="w-5 h-5 shrink-0" />
                  <span className={cn(
                    "whitespace-nowrap transition-all duration-300",
                    isCollapsed ? "w-0 opacity-0 overflow-hidden hidden" : "w-auto opacity-100 block"
                  )}>
                    {item.label}
                  </span>
                </div>
                {!isCollapsed && item.badge && (
                  <span className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                    {item.badge}
                  </span>
                )}
              </>
            );

            if (item.href) {
              return (
                <Link
                  key={item.label}
                  to={item.href}
                  className={commonClasses}
                  title={isCollapsed ? item.label : undefined}
                >
                  {content}
                </Link>
              );
            }

            return (
              <button
                key={item.label}
                onClick={item.onClick}
                className={commonClasses}
                title={isCollapsed ? item.label : undefined}
                type="button"
              >
                {content}
              </button>
            );
          })}
        </div>

        <div>
          {!isCollapsed && (
            <div className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider px-3 mb-3 whitespace-nowrap overflow-hidden transition-opacity duration-300">
              My Spaces
            </div>
          )}
          {isCollapsed && (
             <div className="w-full h-px bg-sidebar-border/50 my-3 transition-opacity duration-300" />
          )}

          <div className="space-y-1">
            {spaces.map((space) => (
              <Link 
                key={space.href}
                to={space.href} 
                className={cn(
                  "flex items-center gap-3 rounded-md text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors h-10",
                  isCollapsed ? "justify-center px-0" : "px-3"
                )}
                title={isCollapsed ? space.name : undefined}
              >
                <div className={cn("w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0", space.color)}>
                  {space.initials}
                </div>
                <span className={cn(
                  "truncate transition-all duration-300",
                  isCollapsed ? "w-0 opacity-0 overflow-hidden hidden" : "w-auto opacity-100 block"
                )}>
                  {space.name}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className={cn("border-t border-sidebar-border bg-sidebar-accent/10 transition-all duration-300", isCollapsed ? "p-4" : "p-4")}>
        <div className={cn("flex items-center gap-2", isCollapsed ? "justify-center" : "justify-between px-2")}>
          {!isCollapsed ? (
            <>
              <div className="flex items-center gap-2 text-sm font-medium text-sidebar-foreground/80 whitespace-nowrap overflow-hidden">
                <Eye className="w-4 h-4" />
                <span>Activity View</span>
              </div>
              <Switch id="activity-view" />
            </>
          ) : (
             <Eye className="w-4 h-4 text-sidebar-foreground/70" />
          )}
        </div>
      </div>
      <InvitationsDialog open={showInvitations} onOpenChange={setShowInvitations} />
    </aside>
  );
}
