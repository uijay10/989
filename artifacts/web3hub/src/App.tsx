import { Switch, Route, Router as WouterRouter } from "wouter";
import { Web3Provider } from "@/lib/web3";
import { LanguageProvider } from "@/lib/i18n";
import { Layout } from "@/components/layout";
import { EventFilterProvider } from "@/lib/event-filter-context";

import Home from "@/pages/home";
import Showcase from "@/pages/showcase";
import KOLZone from "@/pages/kol";
import { useEffect } from "react";
import { useLocation } from "wouter";
import Community from "@/pages/community";
import Profile from "@/pages/profile";
import PublicProfile from "@/pages/profile-public";
import ApplySpace from "@/pages/apply";
import PostNew from "@/pages/post-new";
import PostDetail from "@/pages/post-detail";
import ProjectDetail from "@/pages/project-detail";
import SectionPage from "@/pages/section";
import AdminPage from "@/pages/admin";
import MembersPage from "@/pages/members";
import AboutPage from "@/pages/about";
import NotFound from "@/pages/not-found";
import ChainColumnPage from "@/pages/chain";
import ExchangeColumnPage from "@/pages/exchange";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/showcase" component={Showcase} />
      <Route path="/kol" component={KOLZone} />
      <Route path="/developer" component={() => { const [, nav] = useLocation(); useEffect(() => { nav("/section/devbounty"); }, []); return null; }} />
      <Route path="/community" component={Community} />
      <Route path="/profile" component={Profile} />
      <Route path="/profile/:wallet" component={PublicProfile} />
      <Route path="/apply" component={ApplySpace} />
      <Route path="/post/new" component={PostNew} />
      <Route path="/post/:id" component={PostDetail} />
      <Route path="/project/:id" component={ProjectDetail} />
      <Route path="/section/:slug" component={SectionPage} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/members" component={MembersPage} />
      <Route path="/about" component={AboutPage} />
      <Route path="/chains/:slug" component={ChainColumnPage} />
      <Route path="/exchanges/:slug" component={ExchangeColumnPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <Web3Provider>
      <LanguageProvider>
        <EventFilterProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Layout>
              <Router />
            </Layout>
          </WouterRouter>
        </EventFilterProvider>
      </LanguageProvider>
    </Web3Provider>
  );
}

export default App;
