import { useState } from "react";
import { Search, Filter, MoreHorizontal, UserPlus, Mail, Shield, User, SlidersHorizontal, CheckCircle2 } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/app/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/app/components/ui/dropdown-menu";
import { Link } from "react-router";
import { cn } from "@/lib/utils";

// Mock Data
export const SPACE_MEMBERS = [
  // 5 Key Users (from Banner)
  {
    id: 'u1',
    name: "Elena Martinez",
    role: "Host",
    roleType: "admin",
    joinDate: "Oct 2023",
    avatar: "https://images.unsplash.com/photo-1623853589874-864b1dd4d922?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx3b21hbiUyMGdsYXNzZXMlMjBibGFjayUyMGFuZCUyMHdoaXRlJTIwcG9ydHJhaXR8ZW58MXx8fHwxNzY5NDQyNTM3fDA&ixlib=rb-4.1.0&q=80&w=256",
    initials: "EM",
    bio: "Community Host. Driving sustainable innovation in urban planning."
  },
  {
    id: 'u2',
    name: "Sarah Chen",
    role: "Admin",
    roleType: "admin",
    joinDate: "Nov 2023",
    avatar: "https://images.unsplash.com/photo-1757347398206-7425300ef990?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx3b21hbiUyMHNtaWxpbmclMjBkYXJrJTIwaGFpciUyMHBvcnRyYWl0fGVufDF8fHx8MTc2OTQ0MjUzN3ww&ixlib=rb-4.1.0&q=80&w=256",
    initials: "SC",
    bio: "Energy systems analyst with a passion for green tech."
  },
  {
    id: 'u3',
    name: "Maya Ross",
    role: "Lead",
    roleType: "moderator",
    joinDate: "Dec 2023",
    avatar: "https://images.unsplash.com/photo-1589332911105-a6b59f2e4c4b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx3b21hbiUyMHNtaWxpbmclMjBkYXJrJTIwaGFpciUyMHBvcnRyYWl0fGVufDF8fHx8MTc2OTQ0MjUzN3ww&ixlib=rb-4.1.0&q=80&w=256",
    initials: "MR",
    bio: "Focusing on community engagement and policy."
  },
  {
    id: 'u4',
    name: "David Kim",
    role: "Member",
    roleType: "member",
    joinDate: "Jan 2024",
    avatar: "https://images.unsplash.com/photo-1651634099348-e4c38cfaa6d5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtYW4lMjBiZWFyZCUyMHN1bnNldCUyMHBvcnRyYWl0fGVufDF8fHx8MTc2OTQ0MjUzN3ww&ixlib=rb-4.1.0&q=80&w=256",
    initials: "DK",
    bio: "Ensuring our discussions remain productive and respectful."
  },
  {
    id: 'u5',
    name: "Robert Fox",
    role: "Member",
    roleType: "member",
    joinDate: "Jan 2024",
    avatar: "https://images.unsplash.com/photo-1651097681268-851acda33b18?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxvbGRlciUyMG1hbiUyMHdoaXRlJTIwYmVhcmQlMjBnbGFzc2VzJTIwcG9ydHJhaXR8ZW58MXx8fHwxNzY5NDQyNTM3fDA&ixlib=rb-4.1.0&q=80&w=256",
    initials: "RF",
    bio: "Architectural designer specializing in eco-friendly materials."
  },
  // Generated Members (24 more)
  ...Array.from({ length: 24 }).map((_, i) => ({
    id: `m${i+6}`,
    name: [
      "James Wilson", "Emma Thompson", "Lucas Oliveira", "Sophia Li", "Oliver Smith", 
      "Ava Patel", "William Chen", "Isabella Garcia", "Henry Wilson", "Mia Kim",
      "Alexander Wright", "Charlotte Davis", "Daniel Lee", "Amelia White", "Matthew Clark",
      "Harper Lewis", "Joseph Hall", "Evelyn Young", "Samuel Allen", "Abigail King",
      "Benjamin Scott", "Elizabeth Green", "Jack Baker", "Victoria Adams"
    ][i] || `Member ${i+6}`,
    role: i < 3 ? "Lead" : "Member",
    roleType: i < 3 ? "moderator" : "member",
    joinDate: "Feb 2024",
    avatar: null,
    initials: [
      "JW", "ET", "LO", "SL", "OS", "AP", "WC", "IG", "HW", "MK",
      "AW", "CD", "DL", "AW", "MC", "HL", "JH", "EY", "SA", "AK",
      "BS", "EG", "JB", "VA"
    ][i] || `M${i+6}`,
    bio: "Passionate about contributing to the community space."
  }))
];

const ROLES = ["All", "Host", "Admin", "Lead", "Member"];

export function SpaceMembers() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRole, setSelectedRole] = useState("All");

  const filteredMembers = SPACE_MEMBERS.filter((member) => {
    const matchesSearch = member.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          member.role.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = selectedRole === "All" || member.role === selectedRole;
    return matchesSearch && matchesRole;
  });

  const getRoleBadgeColor = (roleType: string) => {
    switch (roleType) {
      case "admin":
        return "bg-primary/10 text-primary border-primary/20";
      case "moderator":
        return "bg-indigo-500/10 text-indigo-500 border-indigo-500/20";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  const getRoleIcon = (roleType: string) => {
    switch (roleType) {
      case "admin":
        return <Shield className="w-3 h-3 mr-1" />;
      case "moderator":
        return <CheckCircle2 className="w-3 h-3 mr-1" />;
      default:
        return <User className="w-3 h-3 mr-1" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Community</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {SPACE_MEMBERS.length} members working together in this space.
          </p>
        </div>
        <Button className="shrink-0">
          <UserPlus className="w-4 h-4 mr-2" />
          Invite Member
        </Button>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search members by name or role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-9 pr-4 rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm transition-all"
          />
        </div>
        
        <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 no-scrollbar">
          {ROLES.map((role) => (
            <button
              key={role}
              onClick={() => setSelectedRole(role)}
              className={cn(
                "px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap border",
                selectedRole === role
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground"
              )}
            >
              {role}
            </button>
          ))}
        </div>
      </div>

      {/* Members Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredMembers.map((member) => (
          <Card key={member.id} className="overflow-hidden hover:shadow-md transition-shadow">
            <CardContent className="p-0">
              <div className="p-4 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <Link to={`/user/${member.name.toLowerCase().replace(/\s+/g, '-')}`} className="group-hover:opacity-80 transition-opacity">
                    <Avatar className="w-12 h-12 border border-border">
                      {member.avatar && <AvatarImage src={member.avatar} alt={member.name} />}
                      <AvatarFallback>{member.initials}</AvatarFallback>
                    </Avatar>
                  </Link>
                  <div>
                    <Link 
                      to={`/user/${member.name.toLowerCase().replace(/\s+/g, '-')}`}
                      className="font-semibold text-foreground hover:text-primary transition-colors block"
                    >
                      {member.name}
                    </Link>
                    <div className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border mt-1", getRoleBadgeColor(member.roleType))}>
                      {getRoleIcon(member.roleType)}
                      {member.role}
                    </div>
                  </div>
                </div>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>View Profile</DropdownMenuItem>
                    <DropdownMenuItem>Message</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive">Remove from Space</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              
              <div className="px-4 pb-4">
                <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
                  {member.bio}
                </p>
                <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    Joined {member.joinDate}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredMembers.length === 0 && (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-4">
            <User className="w-6 h-6 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-foreground">No members found</h3>
          <p className="text-muted-foreground mt-1">
            Try adjusting your search or filters to find what you're looking for.
          </p>
          <Button variant="link" onClick={() => { setSearchQuery(""); setSelectedRole("All"); }} className="mt-2 text-primary">
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}
