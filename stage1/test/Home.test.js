import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import Home from "../screens/profils/Home";

// Mock modules qui posent problème
jest.mock("react-native-linear-gradient", () => {
  return ({ children }) => children; // Rendu simple
});
jest.mock("react-native-vector-icons/FontAwesome", () => "Icon");

// Mock TransactionCard sans JSX
jest.mock("../../utils/transactionCard", () => {
  const React = require("react");
  return function TransactionCard({ transaction }) {
    return React.createElement("Text", null, transaction.type);
  };
});

// Mock dataTrans
jest.mock("../../utils/dataTrans", () => ({
  transaction: [
    { type: "dépense", amount: 100 },
    { type: "revenu", amount: 200 },
  ],
}));

describe("Home Component - composants sûrs", () => {
  it("rend les textes principaux", () => {
    const { getByText } = render(<Home />);
    expect(getByText("Bienvenue, Beriole")).toBeTruthy();
    expect(getByText("Portefeuille")).toBeTruthy();
    expect(getByText("transactions Recentes")).toBeTruthy();
  });

  it("permet de presser les boutons", () => {
    const { getByText } = render(<Home />);
    fireEvent.press(getByText("Dépenser"));
    fireEvent.press(getByText("Déposer"));
    fireEvent.press(getByText("Transférer"));
    fireEvent.press(getByText("Historique"));
  });

  it("affiche les transactions mockées", () => {
    const { getByText } = render(<Home />);
    expect(getByText("dépense")).toBeTruthy();
    expect(getByText("revenu")).toBeTruthy();
  });
});
