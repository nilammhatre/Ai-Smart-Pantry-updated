import { useState } from "react";
import { useAuth } from "@/lib/auth-store";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, LogIn, UserPlus, Users, LogOut, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export function UserAuthModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { user, users, login, signup, switchUser, logout } = useAuth();
  const [tab, setTab] = useState<"login" | "signup" | "switch">("switch");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    const ok = login(email);
    if (ok) {
      toast.success(`Logged in as ${email}`);
      onOpenChange(false);
    } else {
      toast.error("User not found with that email. Try signing up!");
    }
  };

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !name) return;
    const newUser = signup(name, email);
    toast.success(`Welcome, ${newUser.name}! Your smart pantry is ready.`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-3xl p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-xl">
            <User className="h-5 w-5 text-primary" />
            User Authentication & Session
          </DialogTitle>
          <DialogDescription>
            Pantry inventory, scan history, and alerts are isolated per user profile.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 flex gap-1 rounded-full border bg-muted p-1">
          <button
            onClick={() => setTab("switch")}
            className={`flex-1 rounded-full py-1.5 text-xs font-semibold transition-colors ${tab === "switch" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}
          >
            Switch Profile
          </button>
          <button
            onClick={() => setTab("login")}
            className={`flex-1 rounded-full py-1.5 text-xs font-semibold transition-colors ${tab === "login" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}
          >
            Log In
          </button>
          <button
            onClick={() => setTab("signup")}
            className={`flex-1 rounded-full py-1.5 text-xs font-semibold transition-colors ${tab === "signup" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}
          >
            Sign Up
          </button>
        </div>

        {tab === "switch" && (
          <div className="mt-4 space-y-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Select Profile:</p>
            <div className="space-y-2">
              {users.map((u) => {
                const active = user?.id === u.id;
                return (
                  <button
                    key={u.id}
                    onClick={() => {
                      switchUser(u.id);
                      toast.success(`Switched to ${u.name}'s pantry`);
                      onOpenChange(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-2xl border p-3 text-left transition-colors ${
                      active ? "border-primary bg-primary-soft" : "bg-card hover:bg-secondary"
                    }`}
                  >
                    <div>
                      <p className="font-semibold text-sm">{u.name}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                    {active && <CheckCircle2 className="h-4 w-4 text-primary" />}
                  </button>
                );
              })}
            </div>

            {user && (
              <Button
                variant="outline"
                className="mt-4 w-full text-spoiled border-spoiled/40 hover:bg-spoiled-soft"
                onClick={() => {
                  logout();
                  toast.info("Logged out successfully");
                }}
              >
                <LogOut className="mr-2 h-4 w-4" /> Log Out
              </Button>
            )}
          </div>
        )}

        {tab === "login" && (
          <form onSubmit={handleLogin} className="mt-4 space-y-4">
            <div>
              <Label className="text-xs">Email Address</Label>
              <Input
                type="email"
                placeholder="nilam@smartpantry.ai"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full">
              <LogIn className="mr-2 h-4 w-4" /> Log In
            </Button>
          </form>
        )}

        {tab === "signup" && (
          <form onSubmit={handleSignup} className="mt-4 space-y-4">
            <div>
              <Label className="text-xs">Full Name</Label>
              <Input
                placeholder="e.g. Nilam Mhatre"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <Label className="text-xs">Email Address</Label>
              <Input
                type="email"
                placeholder="nilam@smartpantry.ai"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full">
              <UserPlus className="mr-2 h-4 w-4" /> Create Account & Start Pantry
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
