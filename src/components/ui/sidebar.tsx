"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

function Sidebar({ className, ...props }: React.ComponentProps<"aside">) {
  return (
    <aside
      data-slot="sidebar"
      className={cn("hidden w-64 shrink-0 border-r bg-background lg:flex lg:flex-col", className)}
      {...props}
    />
  );
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-header" className={cn("flex h-16 items-center gap-3 px-5", className)} {...props} />;
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-content" className={cn("flex flex-1 flex-col gap-2 p-3", className)} {...props} />;
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"nav">) {
  return <nav data-slot="sidebar-menu" className={cn("flex flex-col gap-1", className)} {...props} />;
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-menu-item" className={cn("min-w-0", className)} {...props} />;
}

function SidebarMenuButton({
  className,
  isActive,
  ...props
}: React.ComponentProps<"button"> & { isActive?: boolean }) {
  return (
    <button
      data-active={isActive ? "true" : "false"}
      data-slot="sidebar-menu-button"
      className={cn(
        "flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        isActive && "bg-blue-50 text-blue-700 hover:bg-blue-50 hover:text-blue-700",
        className
      )}
      type="button"
      {...props}
    />
  );
}

export {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
};
