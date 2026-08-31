// 0010 R1 + R5. The wizard is the app.
//
// This file used to mount a Header and a LaborPage, both deleted with the map.
// It is now the mount point for the shell, and nothing else: the wizard's step
// state lives inside WizardShell, and there is no router — that is a Non-goal,
// with real routes left to issues #24 and #15.
import WizardShell from './components/wizard/WizardShell'

export default function App() {
  return <WizardShell />
}
