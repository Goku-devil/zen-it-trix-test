import { useEffect, useState } from 'react'
import './AppV2.css'
import { nonTechnicalEvents, schedule, technicalEvents } from './data'
import ContactSection from './components/ContactSection'
import AnimatedOverlay from './components/AnimatedOverlay'
import AdminDashboard from './components/AdminDashboard'
import FoodAdminPage from './components/FoodAdminPage'
import EventsSection from './components/EventsSection'
import Footer from './components/Footer'
import Hero from './components/Hero'
import RegistrationForm from './components/RegistrationForm'
import Schedule from './components/Schedule'
import SiteNav from './components/SiteNav'

function IntroStrip() {
    return <section className="intro-strip"><p><span className="strip-dot"></span> One campus. Two tracks. Endless ways to win.</p><p className="scroll-note">Scroll to discover <span>↓</span></p></section>
}

function App() {
    const [theme, setTheme] = useState(() => localStorage.getItem('zen-theme') || 'terminal')
    const [registration, setRegistration] = useState(null)
    const [hash, setHash] = useState(() => window.location.hash)

    useEffect(() => {
        localStorage.setItem('zen-theme', theme)
        document.documentElement.setAttribute('data-theme', theme)
    }, [theme])

    useEffect(() => {
        const handleHashChange = () => setHash(window.location.hash)
        window.addEventListener('hashchange', handleHashChange)
        return () => window.removeEventListener('hashchange', handleHashChange)
    }, [])

    if (hash === '#food-admin' || hash === '#food') {
        return (
            <main className={`theme-${theme}`}>
                <SiteNav isAdmin={true} isFoodAdmin={true} />
                <FoodAdminPage />
                <Footer theme={theme} onThemeChange={setTheme} />
            </main>
        )
    }

    if (hash === '#admin') {
        return (
            <main className={`theme-${theme}`}>
                <AnimatedOverlay />
                <SiteNav isAdmin={true} />
                <AdminDashboard />
                <Footer theme={theme} onThemeChange={setTheme} />
            </main>
        )
    }

    return <main className={`theme-${theme}`}><AnimatedOverlay /><SiteNav /><Hero onRegister={() => setRegistration({})} /><IntroStrip /><EventsSection technicalEvents={technicalEvents} nonTechnicalEvents={nonTechnicalEvents} onRegister={(eventName) => setRegistration({ eventName })} /><Schedule items={schedule} /><ContactSection technicalEvents={technicalEvents} nonTechnicalEvents={nonTechnicalEvents} /><Footer theme={theme} onThemeChange={setTheme} />{registration && <RegistrationForm initialEvent={registration.eventName} events={[...technicalEvents, ...nonTechnicalEvents]} onClose={() => setRegistration(null)} />}</main>
}

export default App
