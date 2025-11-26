import { useMemo } from 'react'

function App() {
	const queryParams = useMemo(() => {
		const params = new URLSearchParams(window.location.search)
		return Object.fromEntries(params.entries())
	}, [])

	return (
		<div style={styles.container}>
			<div style={styles.card}>
				<h1 style={styles.title}>Query Parameters</h1>

				{Object.keys(queryParams).length === 0 ? (
					<p style={styles.empty}>No parameters found</p>
				) : (
					<ul style={styles.list}>
						{Object.entries(queryParams).map(([key, value]) => (
							<li key={key} style={styles.item}>
								<span style={styles.key}>{key}</span>
								<span style={styles.separator}>→</span>
								<span style={styles.value}>{value}</span>
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	)
}

const styles = {
	container: {
		minHeight: '100vh',
		background: '#0f0f0f',
		color: '#fff',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		fontFamily: 'system-ui, sans-serif',
	},
	card: {
		background: '#1a1a1a',
		padding: '32px',
		borderRadius: '16px',
		width: '90%',
		maxWidth: '500px',
		boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
		border: '1px solid #2b2b2b',
		transition: '0.3s',
	},
	title: {
		marginBottom: '20px',
		fontSize: '24px',
		fontWeight: 600,
	},
	empty: {
		opacity: 0.6,
	},
	list: {
		listStyle: 'none',
		padding: 0,
		margin: 0,
	},
	item: {
		display: 'flex',
		gap: '8px',
		alignItems: 'center',
		padding: '10px 0',
		borderBottom: '1px solid #2b2b2b',
		fontSize: '18px',
	},
	key: {
		fontWeight: 600,
		color: '#4da3ff',
	},
	separator: {
		opacity: 0.5,
	},
	value: {
		opacity: 0.9,
	},
}

export default App
