import { Router, Request, Response } from "express";
import { db } from "../firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

const router = Router();

// Constants for limits (single watchlist, unlimited instruments)
const MAX_WATCHLISTS_PER_USER = 1;

// Types
interface WatchlistInstrument {
    id: string;
    exchange: string;
    token: string;
    tradingSymbol: string;
    displayName: string;
    instrumentType: "EQ" | "FUT" | "CE" | "PE";
    expiry?: string;
    strikePrice?: number;
    lotSize?: number;
    addedAt: string;
}

interface Watchlist {
    id: string;
    name: string;
    userId: string;
    instruments: WatchlistInstrument[];
    createdAt: FirebaseFirestore.Timestamp;
    updatedAt: FirebaseFirestore.Timestamp;
    isDefault?: boolean;
}

// Helper to get user watchlists collection reference
const getUserWatchlistsRef = (userId: string) =>
    db.collection("users").doc(userId).collection("watchlists");

/**
 * GET /watchlists - Get all watchlists for authenticated user
 */
router.get("/", async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = "default";

        const snapshot = await getUserWatchlistsRef(userId)
            .orderBy("createdAt", "asc")
            .get();

        const watchlists = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || null,
            updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() || null,
        }));

        res.json({ watchlists });
    } catch (error) {
        console.error("Error fetching watchlists:", error);
        res.status(500).json({ error: "Failed to fetch watchlists" });
    }
});

/**
 * POST /watchlists - Create a new watchlist
 */
router.post("/", async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = "default";

        const { name } = req.body;
        if (!name || typeof name !== "string" || name.trim().length === 0) {
            res.status(400).json({ error: "Watchlist name is required" });
            return;
        }

        // Check watchlist count limit
        const existingCount = (await getUserWatchlistsRef(userId).count().get())
            .data().count;
        if (existingCount >= MAX_WATCHLISTS_PER_USER) {
            res.status(400).json({
                error: `Maximum ${MAX_WATCHLISTS_PER_USER} watchlists allowed per user`,
            });
            return;
        }

        const now = FieldValue.serverTimestamp();
        const docRef = getUserWatchlistsRef(userId).doc();

        const watchlistData = {
            name: name.trim(),
            userId,
            instruments: [],
            createdAt: now,
            updatedAt: now,
            isDefault: existingCount === 0, // First watchlist is default
        };

        await docRef.set(watchlistData);

        res.status(201).json({
            id: docRef.id,
            ...watchlistData,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error("Error creating watchlist:", error);
        res.status(500).json({ error: "Failed to create watchlist" });
    }
});

/**
 * PUT /watchlists/:id - Update a watchlist (rename, set default)
 */
router.put("/:id", async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = "default";

        const { id } = req.params;
        const { name, isDefault } = req.body;

        const docRef = getUserWatchlistsRef(userId).doc(id);
        const doc = await docRef.get();

        if (!doc.exists) {
            res.status(404).json({ error: "Watchlist not found" });
            return;
        }

        const updates: Record<string, any> = {
            updatedAt: FieldValue.serverTimestamp(),
        };

        if (name && typeof name === "string" && name.trim().length > 0) {
            updates.name = name.trim();
        }

        if (typeof isDefault === "boolean" && isDefault) {
            // Unset default on all other watchlists
            const batch = db.batch();
            const otherWatchlists = await getUserWatchlistsRef(userId)
                .where("isDefault", "==", true)
                .get();

            otherWatchlists.docs.forEach((doc) => {
                if (doc.id !== id) {
                    batch.update(doc.ref, { isDefault: false });
                }
            });

            await batch.commit();
            updates.isDefault = true;
        }

        await docRef.update(updates);

        const updatedDoc = await docRef.get();
        res.json({
            id: updatedDoc.id,
            ...updatedDoc.data(),
            createdAt: updatedDoc.data()?.createdAt?.toDate?.()?.toISOString() || null,
            updatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error("Error updating watchlist:", error);
        res.status(500).json({ error: "Failed to update watchlist" });
    }
});

/**
 * DELETE /watchlists/:id - Delete a watchlist
 */
router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = "default";

        const { id } = req.params;
        const docRef = getUserWatchlistsRef(userId).doc(id);
        const doc = await docRef.get();

        if (!doc.exists) {
            res.status(404).json({ error: "Watchlist not found" });
            return;
        }

        await docRef.delete();

        res.json({ success: true, message: "Watchlist deleted" });
    } catch (error) {
        console.error("Error deleting watchlist:", error);
        res.status(500).json({ error: "Failed to delete watchlist" });
    }
});

/**
 * POST /watchlists/:id/instruments - Add instrument to watchlist
 */
router.post(
    "/:id/instruments",
    async (req: Request, res: Response): Promise<void> => {
        try {
            const userId = "default";

            const { id } = req.params;
            const { instrument } = req.body;

            if (
                !instrument ||
                !instrument.exchange ||
                !instrument.token ||
                !instrument.tradingSymbol
            ) {
                res.status(400).json({
                    error:
                        "Invalid instrument data. Required: exchange, token, tradingSymbol",
                });
                return;
            }

            const docRef = getUserWatchlistsRef(userId).doc(id);
            const doc = await docRef.get();

            if (!doc.exists) {
                res.status(404).json({ error: "Watchlist not found" });
                return;
            }

            const data = doc.data() as Watchlist;
            const instruments = data.instruments || [];

            // Check for duplicate
            const exists = instruments.some(
                (i) => i.exchange === instrument.exchange && i.token === instrument.token
            );
            if (exists) {
                res.status(400).json({ error: "Instrument already in watchlist" });
                return;
            }

            const newInstrument: WatchlistInstrument = {
                id: `${instrument.exchange}_${instrument.token}_${Date.now()}`,
                exchange: instrument.exchange,
                token: String(instrument.token),
                tradingSymbol: instrument.tradingSymbol,
                displayName: instrument.displayName || instrument.tradingSymbol,
                instrumentType: instrument.instrumentType || "EQ",
                addedAt: new Date().toISOString(),
            };

            // Add optional fields only if defined
            if (instrument.expiry) newInstrument.expiry = instrument.expiry;
            if (instrument.strikePrice) newInstrument.strikePrice = instrument.strikePrice;
            if (instrument.lotSize) newInstrument.lotSize = instrument.lotSize;

            // Use spread instead of arrayUnion to avoid Firestore issues with objects
            await docRef.update({
                instruments: [...instruments, newInstrument],
                updatedAt: FieldValue.serverTimestamp(),
            });

            res.status(201).json({ instrument: newInstrument });
        } catch (error) {
            console.error("Error adding instrument:", error);
            res.status(500).json({ error: "Failed to add instrument" });
        }
    }
);

/**
 * DELETE /watchlists/:id/instruments/:instrumentId - Remove instrument from watchlist
 */
router.delete(
    "/:id/instruments/:instrumentId",
    async (req: Request, res: Response): Promise<void> => {
        try {
            const userId = "default";

            const { id, instrumentId } = req.params;
            const docRef = getUserWatchlistsRef(userId).doc(id);
            const doc = await docRef.get();

            if (!doc.exists) {
                res.status(404).json({ error: "Watchlist not found" });
                return;
            }

            const data = doc.data() as Watchlist;
            const instruments = data.instruments || [];
            const instrumentToRemove = instruments.find((i) => i.id === instrumentId);

            if (!instrumentToRemove) {
                res.status(404).json({ error: "Instrument not found in watchlist" });
                return;
            }

            await docRef.update({
                instruments: FieldValue.arrayRemove(instrumentToRemove),
                updatedAt: FieldValue.serverTimestamp(),
            });

            res.json({ success: true, message: "Instrument removed" });
        } catch (error) {
            console.error("Error removing instrument:", error);
            res.status(500).json({ error: "Failed to remove instrument" });
        }
    }
);

/**
 * PUT /watchlists/:id/instruments/reorder - Reorder instruments in watchlist
 */
router.put(
    "/:id/instruments/reorder",
    async (req: Request, res: Response): Promise<void> => {
        try {
            const userId = "default";

            const { id } = req.params;
            const { instrumentIds } = req.body;

            if (!Array.isArray(instrumentIds)) {
                res.status(400).json({ error: "instrumentIds must be an array" });
                return;
            }

            const docRef = getUserWatchlistsRef(userId).doc(id);
            const doc = await docRef.get();

            if (!doc.exists) {
                res.status(404).json({ error: "Watchlist not found" });
                return;
            }

            const data = doc.data() as Watchlist;
            const instruments = data.instruments || [];

            // Reorder instruments based on provided order
            const reorderedInstruments = instrumentIds
                .map((instrumentId) => instruments.find((i) => i.id === instrumentId))
                .filter((i): i is WatchlistInstrument => i !== undefined);

            // Add any instruments not in the order list at the end
            const missingInstruments = instruments.filter(
                (i) => !instrumentIds.includes(i.id)
            );
            reorderedInstruments.push(...missingInstruments);

            await docRef.update({
                instruments: reorderedInstruments,
                updatedAt: FieldValue.serverTimestamp(),
            });

            res.json({ instruments: reorderedInstruments });
        } catch (error) {
            console.error("Error reordering instruments:", error);
            res.status(500).json({ error: "Failed to reorder instruments" });
        }
    }
);

export default router;
