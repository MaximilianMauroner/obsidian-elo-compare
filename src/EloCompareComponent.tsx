import { useState } from "react";
import { Vault } from "obsidian";
type Item = {
	id: string;
	name: string;
	rating: number;
	snippet: string;
};

const initialMockItems: Item[] = [
	{
		id: "file-1",
		name: "notes/project-idea.md",
		rating: 1200,
		snippet: "# Project idea\n- Build an Obsidian plugin to...",
	},
	{
		id: "file-2",
		name: "journal/2025-08-24.md",
		rating: 1200,
		snippet: "# Daily journal\nToday I worked on...",
	},
];

function eloUpdate(winnerRating: number, loserRating: number, k = 32) {
	// primitive Elo: expected score and new rating
	const expectedWinner =
		1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
	const expectedLoser =
		1 / (1 + Math.pow(10, (winnerRating - loserRating) / 400));

	const newWinner = Math.round(winnerRating + k * (1 - expectedWinner));
	const newLoser = Math.round(loserRating + k * (0 - expectedLoser));

	return [newWinner, newLoser];
}

export const EloCompareComponent = ({ vault }: { vault: Vault }) => {
	const [items, setItems] = useState<Item[]>(initialMockItems);
	const [pair, setPair] = useState<[number, number]>([0, 1]);
	const [history, setHistory] = useState<string[]>([]);

	console.log(vault.getAllFolders());

	const pickPair = () => {
		// For now we only have two mock items; keep them as the pair.
		// If there were more items, we'd pick two distinct random indices here.
		setPair([0, 1]);
	};

	const handleWin = (winnerIndex: number) => {
		const loserIndex = pair[0] === winnerIndex ? pair[1] : pair[0];

		const winner = items[winnerIndex];
		const loser = items[loserIndex];

		const [newWinnerRating, newLoserRating] = eloUpdate(
			winner.rating,
			loser.rating
		);

		const newItems = items.map((it, idx) => {
			if (idx === winnerIndex) return { ...it, rating: newWinnerRating };
			if (idx === loserIndex) return { ...it, rating: newLoserRating };
			return it;
		});

		setItems(newItems);

		setHistory((h) => [
			`${winner.name} (R:${winner.rating} → ${newWinnerRating}) beat ${loser.name} (R:${loser.rating} → ${newLoserRating})`,
			...h,
		]);

		// pick next pair (same two in this mock)
		pickPair();
	};

	const reset = () => {
		setItems(initialMockItems.map((i) => ({ ...i })));
		setHistory([]);
		pickPair();
	};

	const left = items[pair[0]];
	const right = items[pair[1]];

	return (
		<div style={{ padding: 12, fontFamily: "system-ui, sans-serif" }}>
			<h3>Elo Compare — Mock Files</h3>

			<div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
				<div
					style={{
						flex: 1,
						border: "1px solid var(--interactive-border)",
						padding: 8,
						borderRadius: 6,
					}}
				>
					<h4 style={{ margin: 4 }}>{left.name}</h4>
					<div style={{ fontSize: 12, color: "var(--text-muted)" }}>
						Rating: {left.rating}
					</div>
					<pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>
						{left.snippet}
					</pre>
					<button onClick={() => handleWin(pair[0])}>
						Choose {left.name}
					</button>
				</div>

				<div
					style={{
						flex: 1,
						border: "1px solid var(--interactive-border)",
						padding: 8,
						borderRadius: 6,
					}}
				>
					<h4 style={{ margin: 4 }}>{right.name}</h4>
					<div style={{ fontSize: 12, color: "var(--text-muted)" }}>
						Rating: {right.rating}
					</div>
					<pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>
						{right.snippet}
					</pre>
					<button onClick={() => handleWin(pair[1])}>
						Choose {right.name}
					</button>
				</div>
			</div>

			<div style={{ marginBottom: 12 }}>
				<button onClick={reset} style={{ marginRight: 8 }}>
					Reset
				</button>
				<button
					onClick={() => {
						// swap sides (visual)
						setPair([pair[1], pair[0]]);
					}}
				>
					Swap Sides
				</button>
			</div>

			<div>
				<h4 style={{ marginTop: 0 }}>History</h4>
				{history.length === 0 ? (
					<div style={{ fontSize: 12, color: "var(--text-muted)" }}>
						No comparisons yet.
					</div>
				) : (
					<ul style={{ paddingLeft: 18 }}>
						{history.map((h, i) => (
							<li key={i} style={{ fontSize: 13 }}>
								{h}
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
};
