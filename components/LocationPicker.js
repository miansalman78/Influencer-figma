/**
 * LocationPicker – Country → State → City dropdowns using API.
 * Use for Create/Edit Offer and Create/Edit Campaign. No manual input.
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import * as locationService from '../services/location';

let MaterialIcons;
try {
  const M = require('react-native-vector-icons/MaterialIcons');
  MaterialIcons = M.default || M;
} catch (e) {
  MaterialIcons = () => null;
}

const FALLBACK = {
  countries: [
    { name: 'Nigeria', iso2: 'NG', isoCode: 'NG' },
    { name: 'United States', iso2: 'US', isoCode: 'US' },
    { name: 'United Kingdom', iso2: 'GB', isoCode: 'GB' },
  ],
  states: {
    NG: [
      { name: 'Lagos', iso2: 'LA', isoCode: 'LA' },
      { name: 'Abuja FCT', iso2: 'FC', isoCode: 'FC' },
    ],
    US: [
      { name: 'California', iso2: 'CA', isoCode: 'CA' },
      { name: 'New York', iso2: 'NY', isoCode: 'NY' },
    ],
    GB: [
      { name: 'England', iso2: 'ENG', isoCode: 'ENG' },
      { name: 'Scotland', iso2: 'SCT', isoCode: 'SCT' },
    ],
  },
  cities: {
    'NG-LA': [{ name: 'Lagos' }],
    'NG-FC': [{ name: 'Abuja' }],
    'US-CA': [{ name: 'Los Angeles' }, { name: 'San Francisco' }],
    'US-NY': [{ name: 'New York' }],
    'GB-ENG': [{ name: 'London' }],
    'GB-SCT': [{ name: 'Glasgow' }],
  },
};

const normalizeList = (res) => {
  if (res && res.data && Array.isArray(res.data)) return res.data;
  if (Array.isArray(res)) return res;
  return [];
};

const LocationPicker = ({ value = {}, onChange, required = true, label = 'Location *', style }) => {
  const [countries, setCountries] = useState([]);
  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [selectedState, setSelectedState] = useState(null);
  const [selectedCity, setSelectedCity] = useState(null);
  const [loading, setLoading] = useState({ countries: true, states: false, cities: false });
  const [openDropdown, setOpenDropdown] = useState(null);

  const countryName = value.country || selectedCountry?.name || '';
  const stateName = value.state || selectedState?.name || '';
  const cityName = value.city || selectedCity?.name || (typeof selectedCity === 'string' ? selectedCity : '');

  // Fetch countries on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(l => ({ ...l, countries: true }));
        const res = await locationService.getCountries();
        const list = normalizeList(res);
        if (!cancelled) setCountries(list && list.length > 0 ? list : FALLBACK.countries);
      } catch (err) {
        if (!cancelled) setCountries(FALLBACK.countries);
      } finally {
        if (!cancelled) setLoading(l => ({ ...l, countries: false }));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // When country is selected (or value.country set), fetch states
  useEffect(() => {
    const name = value.country || selectedCountry?.name;
    if (!name && !selectedCountry) {
      setStates([]);
      return;
    }
    const countryObj = selectedCountry || countries.find(c => (c.name || '') === name || (c.iso2 || '') === name);
    const code = countryObj?.iso2 || countryObj?.isoCode;
    if (!code) {
      setStates([]);
      return;
    }
    let cancelled = false;
    setLoading(l => ({ ...l, states: true }));
    locationService.getStates(code)
      .then(res => {
        const list = normalizeList(res);
        if (!cancelled) setStates(list && list.length > 0 ? list : (FALLBACK.states[code] || []));
      })
      .catch(() => { if (!cancelled) setStates(FALLBACK.states[code] || []); })
      .finally(() => { if (!cancelled) setLoading(l => ({ ...l, states: false })); });
    return () => { cancelled = true; };
  }, [value.country, selectedCountry, countries]);

  // When state is selected (or value.state set), fetch cities
  useEffect(() => {
    const countryObj = selectedCountry || (value.country && countries.find(c => (c.name || '') === value.country));
    const stateObj = selectedState || (value.state && states.find(s => (s.name || '') === value.state));
    const countryCode = countryObj?.iso2 || countryObj?.isoCode;
    const stateCode = stateObj?.iso2 || stateObj?.isoCode;
    if (!countryCode || !stateCode) {
      setCities([]);
      return;
    }
    let cancelled = false;
    setLoading(l => ({ ...l, cities: true }));
    locationService.getCities(countryCode, stateCode)
      .then(res => {
        const list = normalizeList(res);
        if (!cancelled) setCities(list && list.length > 0 ? list : (FALLBACK.cities[`${countryCode}-${stateCode}`] || []));
      })
      .catch(() => { if (!cancelled) setCities(FALLBACK.cities[`${countryCode}-${stateCode}`] || []); })
      .finally(() => { if (!cancelled) setLoading(l => ({ ...l, cities: false })); });
    return () => { cancelled = true; };
  }, [value.state, value.country, selectedCountry, selectedState, countries, states]);

  // Sync from value (e.g. edit mode): when lists load, select items matching value
  useEffect(() => {
    if (!value.country) {
      setSelectedCountry(null);
      return;
    }
    if (countries.length > 0) {
      const c = countries.find(x => (x.name || '') === value.country);
      if (c) setSelectedCountry(c);
    }
  }, [value.country, countries]);
  useEffect(() => {
    if (!value.state) {
      setSelectedState(null);
      return;
    }
    if (states.length > 0) {
      const s = states.find(x => (x.name || '') === value.state);
      if (s) setSelectedState(s);
    }
  }, [value.state, states]);
  useEffect(() => {
    if (!value.city) {
      setSelectedCity(null);
      return;
    }
    if (cities.length > 0) {
      const c = cities.find(x => (x.name || '') === value.city);
      if (c) setSelectedCity(c);
    }
  }, [value.city, cities]);

  const emit = (country, state, city) => {
    onChange && onChange({
      country: country?.name ?? country ?? '',
      state: state?.name ?? state ?? '',
      city: (city && (typeof city === 'object' ? city.name : city)) ?? '',
    });
  };

  const onSelectCountry = (c) => {
    setSelectedCountry(c);
    setSelectedState(null);
    setSelectedCity(null);
    setOpenDropdown(null);
    emit(c, null, null);
  };
  const onSelectState = (s) => {
    setSelectedState(s);
    setSelectedCity(null);
    setOpenDropdown(null);
    emit(selectedCountry, s, null);
  };
  const onSelectCity = (c) => {
    const cityName = typeof c === 'object' ? c?.name : c;
    setSelectedCity(c);
    setOpenDropdown(null);
    emit(selectedCountry, selectedState, cityName);
  };

  const dropdown = (key, title, placeholder, items, onSelect, loadingKey) => (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{title}</Text>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setOpenDropdown(openDropdown === key ? null : key)}
        disabled={loading[loadingKey]}
      >
        {loading[loadingKey] ? (
          <ActivityIndicator size="small" color="#337DEB" />
        ) : (
          <Text style={[styles.triggerText, !(key === 'country' ? countryName : key === 'state' ? stateName : cityName) && styles.placeholder]}>
            {(key === 'country' ? countryName : key === 'state' ? stateName : cityName) || placeholder}
          </Text>
        )}
        <MaterialIcons name={openDropdown === key ? 'expand-less' : 'expand-more'} size={24} color="#64748b" />
      </TouchableOpacity>
      {openDropdown === key && (
        <View style={styles.dropdown}>
          <ScrollView nestedScrollEnabled style={styles.dropdownScroll}>
            {items.length === 0 ? (
              <Text style={styles.dropdownEmpty}>No options</Text>
            ) : (
              items.map((item, i) => {
                const name = item.name || item;
                return (
                  <TouchableOpacity
                    key={i}
                    style={styles.option}
                    onPress={() => onSelect(item)}
                  >
                    <Text style={styles.optionText}>{name}</Text>
                    {(key === 'country' ? countryName === name : key === 'state' ? stateName === name : cityName === name) && (
                      <MaterialIcons name="check" size={20} color="#337DEB" />
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );

  return (
    <View style={[styles.wrap, style]}>
      {label ? <Text style={styles.sectionLabel}>{label}</Text> : null}
      {dropdown('country', 'Country', 'Select country', countries, onSelectCountry, 'countries')}
      {dropdown('state', 'State / Province', 'Select state', states, onSelectState, 'states')}
      {dropdown('city', 'City', 'Select city', cities, onSelectCity, 'cities')}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  sectionLabel: { fontSize: 16, fontWeight: '600', color: '#1f2937', marginBottom: 10 },
  inputGroup: { marginBottom: 12 },
  label: { fontSize: 14, color: '#374151', marginBottom: 6 },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  triggerText: { fontSize: 16, color: '#1f2937', flex: 1 },
  placeholder: { color: '#9ca3af' },
  dropdown: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, backgroundColor: '#fff', maxHeight: 200 },
  dropdownScroll: { maxHeight: 200 },
  dropdownEmpty: { padding: 12, color: '#9ca3af' },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 14 },
  optionText: { fontSize: 16, color: '#1f2937' },
});

export default LocationPicker;
