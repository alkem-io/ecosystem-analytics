import { Button } from "@/app/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/app/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Settings, Share2, Video, FileText } from "lucide-react";
import { Link, useLocation } from "react-router";

interface SpaceHeaderProps {
  spaceSlug: string;
}

export function SpaceHeader({ spaceSlug }: SpaceHeaderProps) {
  return (
    <div className="flex flex-col bg-background">
      {/* Hero Banner Section (Scrolls away) */}
      <div className="relative w-full h-[320px] overflow-hidden group">
        {/* Background Image with Overlay */}
        <div 
          className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
          style={{ backgroundImage: `url(https://images.unsplash.com/photo-1690191863988-f685cddde463?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkZXNpZ24lMjBjaGFsbGVuZ2UlMjBjcmVhdGl2ZSUyMHdvcmtzaG9wJTIwdGVhbSUyMGNvbGxhYm9yYXRpb24lMjBpbm5vdmF0aW9uJTIwc3ByaW50JTIwZGVzaWduJTIwc3ByaW50fGVufDF8fHx8MTc2OTA5NDMxMHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral)` }}
        />
        <div className="absolute inset-0 bg-black/50" />

        {/* Content Container */}
        <div className="relative h-full container mx-auto px-6 py-8 flex flex-col justify-between pb-12">
          
          {/* Top Actions Bar */}
          <div className="flex justify-end">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="text-white/80 hover:text-white hover:bg-white/20">
                <FileText className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" className="text-white/80 hover:text-white hover:bg-white/20">
                <Video className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" className="text-white/80 hover:text-white hover:bg-white/20">
                <Share2 className="h-5 w-5" />
              </Button>
              <Link to={`/space/${spaceSlug}/settings`}>
                <Button variant="ghost" size="icon" className="text-white/80 hover:text-white hover:bg-white/20">
                  <Settings className="h-5 w-5" />
                </Button>
              </Link>
            </div>
          </div>

          {/* Bottom Section: Title & Members */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="max-w-3xl text-white">
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 text-white">Innovation Hub</h1>
              <p className="text-lg text-white/90 leading-relaxed max-w-xl">
                Collaborating on the future of sustainable energy solutions and urban transformation.
              </p>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Member Avatars */}
              <div className="flex -space-x-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Avatar key={i} className="border-2 border-transparent ring-2 ring-black/20 w-10 h-10 transition-transform hover:z-10 hover:scale-110">
                    <AvatarImage src={`https://i.pravatar.cc/150?u=${i + 10}`} />
                    <AvatarFallback className="bg-primary/20 text-white text-xs">U{i}</AvatarFallback>
                  </Avatar>
                ))}
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm border-2 border-transparent ring-2 ring-black/20 text-white text-xs font-medium hover:bg-white/30 cursor-pointer transition-colors">
                  +24
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
