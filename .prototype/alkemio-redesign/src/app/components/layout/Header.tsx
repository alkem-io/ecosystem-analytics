import { Bell, Search, Menu, User, Settings, LogOut, Check, MessageSquare, Heart, UserPlus, Clock, Layout, Network, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link, useNavigate } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/app/components/ui/avatar";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { useState } from "react";
import { MessagesDialog } from "@/app/components/dialogs/MessagesDialog";

// Mock Notifications Data
const notifications = [
  {
    id: 1,
    author: "Sarah Chen",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=150",
    action: "commented on",
    target: "Sustainability Goals 2024",
    time: "2m ago",
    read: false,
    type: "comment"
  },
  {
    id: 2,
    author: "Marc Johnson",
    avatar: "https://images.unsplash.com/photo-1599566150163-29194dcaad36?auto=format&fit=crop&q=80&w=150",
    action: "invited you to",
    target: "Urban Mobility Lab",
    time: "1h ago",
    read: false,
    type: "invite"
  },
  {
    id: 3,
    author: "Alkemio Bot",
    avatar: "", 
    action: "mentioned you in",
    target: "Platform Updates Q1",
    time: "5h ago",
    read: true,
    type: "mention"
  }
];

export function Header({ className, onMenuClick }: { className?: string, onMenuClick?: () => void }) {
  const [showMessages, setShowMessages] = useState(false);
  const unreadCount = notifications.filter(n => !n.read).length;
  const navigate = useNavigate();

  return (
    <>
      <header className={cn("h-16 border-b border-border bg-background sticky top-0 z-50 px-6 flex items-center justify-between", className)}>
        <div className="flex items-center gap-4 flex-1">
          <button onClick={onMenuClick} className="md:hidden p-2 -ml-2 hover:bg-accent rounded-md">
            <Menu className="w-5 h-5" />
          </button>
          <div className="relative w-full max-w-md hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search spaces, challenges..." 
              className="w-full h-10 pl-10 pr-4 rounded-full bg-secondary/50 border-transparent focus:bg-background focus:border-primary focus:ring-1 focus:ring-primary text-[length:var(--text-sm)] transition-all outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowMessages(true)}
            className="relative p-2 rounded-full hover:bg-accent text-muted-foreground transition-colors outline-none focus:bg-accent"
            title="Messages"
          >
            <MessageSquare className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-500 rounded-full border border-background"></span>
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="relative p-2 rounded-full hover:bg-accent text-muted-foreground transition-colors outline-none focus:bg-accent">
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-background"></span>
                )}
              </button>
            </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 md:w-96 p-0 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
              <h3 className="font-semibold text-[length:var(--text-sm)]">Notifications</h3>
              <Button variant="ghost" size="sm" className="h-auto px-2 text-[length:var(--text-xs)] text-primary hover:text-primary/80">
                Mark all as read
              </Button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {notifications.length > 0 ? (
                <div className="flex flex-col">
                  {notifications.map((notification) => (
                    <div 
                      key={notification.id} 
                      className={cn(
                        "flex gap-3 p-4 hover:bg-muted/50 transition-colors cursor-pointer border-b last:border-0",
                        !notification.read && "bg-primary/5 hover:bg-primary/10"
                      )}
                    >
                      <div className="flex-shrink-0 mt-0.5">
                        <Avatar className="w-8 h-8 md:w-10 md:h-10 border border-border">
                          <AvatarImage src={notification.avatar} />
                          <AvatarFallback className="bg-primary/10 text-primary text-[length:var(--text-xs)]">
                            {notification.author.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        {notification.type === 'invite' && (
                           <div className="absolute -mt-3 -ml-1 bg-blue-500 text-white rounded-full p-0.5 border border-background">
                             <UserPlus className="w-2.5 h-2.5" />
                           </div>
                        )}
                        {notification.type === 'comment' && (
                           <div className="absolute -mt-3 -ml-1 bg-green-500 text-white rounded-full p-0.5 border border-background">
                             <MessageSquare className="w-2.5 h-2.5" />
                           </div>
                        )}
                        {notification.type === 'mention' && (
                           <div className="absolute -mt-3 -ml-1 bg-orange-500 text-white rounded-full p-0.5 border border-background">
                             <Check className="w-2.5 h-2.5" />
                           </div>
                        )}
                      </div>
                      <div className="flex-1 space-y-1">
                        <p className="text-[length:var(--text-sm)] leading-snug text-foreground">
                          <span className="font-semibold">{notification.author}</span>
                          {" "}{notification.action}{" "}
                          <span className="font-medium text-foreground/80">{notification.target}</span>
                        </p>
                        <p className="text-[length:var(--text-xs)] text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {notification.time}
                        </p>
                      </div>
                      {!notification.read && (
                        <div className="flex-shrink-0 mt-1.5">
                           <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-[length:var(--text-sm)]">No new notifications</p>
                </div>
              )}
            </div>
            <div className="p-2 border-t bg-muted/30 text-center">
              <Button variant="ghost" size="sm" className="w-full text-[length:var(--text-xs)] h-8" asChild>
                <Link to="/user/alex-rivera/settings/notifications">
                  Manage Settings
                </Link>
              </Button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        
        <div className="h-6 w-px bg-border hidden md:block"></div>

        <DropdownMenu>
          <DropdownMenuTrigger className="outline-none">
            <div className="flex items-center gap-3 hover:bg-accent/50 p-1.5 rounded-full pr-3 transition-colors cursor-pointer">
              <Avatar className="h-8 w-8 border border-border">
                <AvatarImage src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80" alt="User" />
                <AvatarFallback>AC</AvatarFallback>
              </Avatar>
              <div className="hidden md:flex flex-col items-start text-[length:var(--text-sm)]">
                <span className="font-medium leading-none">Alex Contributor</span>
                <span className="text-[length:var(--text-xs)] text-muted-foreground">Portfolio Owner</span>
              </div>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-[length:var(--text-xs)] uppercase tracking-wider text-muted-foreground">Switch App</DropdownMenuLabel>
            <div className="px-1 py-1">
                <div className="flex items-center justify-between px-2 py-1.5 rounded-sm bg-accent/50 cursor-default">
                    <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-primary" />
                        <span className="font-medium text-[length:var(--text-sm)]">Alkemio</span>
                    </div>
                    <Check className="w-3 h-3 text-primary" />
                </div>
                <div 
                    className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => navigate('/analytics')}
                >
                    <Network className="w-4 h-4" />
                    <span className="font-medium text-[length:var(--text-sm)]">Ecosystem Analytics</span>
                </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[length:var(--text-xs)] uppercase tracking-wider text-muted-foreground">My Account</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link to="/user/alex-rivera" className="cursor-pointer">
                <User className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/design-system" className="cursor-pointer">
                <Layout className="mr-2 h-4 w-4" />
                <span>Design System</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
      <MessagesDialog open={showMessages} onOpenChange={setShowMessages} />
    </>
  );
}
