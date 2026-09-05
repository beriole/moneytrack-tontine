// __tests__/SuccessRecharge.test.js
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import SuccessRecharge from '../path/to/SuccessRecharge';

// Mock de useNavigation pour Jest
const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => {
  return {
    useNavigation: () => ({
      navigate: mockNavigate,
    }),
  };
});

describe('SuccessRecharge Component', () => {
  it('devrait afficher le texte de succès', () => {
    const { getByText } = render(<SuccessRecharge />);
    expect(getByText('Recharge effectuée avec succès !')).toBeTruthy();
  });

  it('devrait afficher le bouton "Retour à l\'accueil"', () => {
    const { getByText } = render(<SuccessRecharge />);
    const button = getByText("Retour à l'accueil");
    expect(button).toBeTruthy();
  });

  it('devrait naviguer vers Home lorsqu\'on clique sur le bouton', () => {
    const { getByText } = render(<SuccessRecharge />);
    const button = getByText("Retour à l'accueil");

    fireEvent.press(button);

    expect(mockNavigate).toHaveBeenCalledWith('Home');
  });
});
