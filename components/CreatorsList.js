import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, FlatList, Image, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlatformIcon } from '../utils/platformIcons';

// Import MaterialIcons
let MaterialIcons;
try {
    const MaterialIconModule = require('react-native-vector-icons/MaterialIcons');
    MaterialIcons = MaterialIconModule.default || MaterialIconModule;
    if (typeof MaterialIcons !== 'function') {
        MaterialIcons = ({ name, size, color, style }) => (
            <Text style={[{ fontSize: size || 20, color: color || '#000' }, style]}>?</Text>
        );
    }
} catch (error) {
    console.error('Error importing MaterialIcons:', error);
    MaterialIcons = ({ name, size, color, style }) => (
        <Text style={[{ fontSize: size || 20, color: color || '#000' }, style]}>?</Text>
    );
}

const normalizeLocationList = (res) => {
    if (res && res.data && Array.isArray(res.data)) return res.data;
    if (Array.isArray(res)) return res;
    return [];
};

const CreatorsList = ({ navigation, route }) => {
    const [searchText, setSearchText] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [selectedLocation, setSelectedLocation] = useState('All');
    const [filterExpanded, setFilterExpanded] = useState(true);
    const [allCreators, setAllCreators] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    // Location filter from API (country + state dropdowns)
    const [countries, setCountries] = useState([]);
    const [states, setStates] = useState([]);
    const [selectedCountry, setSelectedCountry] = useState(null);
    const [selectedState, setSelectedState] = useState(null);
    const [locationDropdownOpen, setLocationDropdownOpen] = useState(null); // 'country' | 'state' | null

    const categories = ['All', 'Fashion', 'Beauty', 'Lifestyle', 'Tech', 'Fitness', 'Food', 'Travel'];

    // Map API category to UI category
    const mapCategoryToUI = (category) => {
        const categoryMap = {
            'fashion_beauty': 'Fashion',
            'beauty': 'Beauty',
            'lifestyle': 'Lifestyle',
            'tech_gadgets': 'Tech',
            'fitness_health': 'Fitness',
            'food_dining': 'Food',
            'travel': 'Travel',
        };
        return categoryMap[category] || category;
    };

    // Map UI category to API category
    const mapUIToCategory = (uiCategory) => {
        if (uiCategory === 'All') return null;
        const categoryMap = {
            'Fashion': 'fashion_beauty',
            'Beauty': 'beauty',
            'Lifestyle': 'lifestyle',
            'Tech': 'tech_gadgets',
            'Fitness': 'fitness_health',
            'Food': 'food_dining',
            'Travel': 'travel',
        };
        return categoryMap[uiCategory];
    };

    // Fetch countries for location filter (Nigeria + others from API)
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const locationService = await import('../services/location');
                const res = await locationService.getCountries();
                const list = normalizeLocationList(res);
                if (!cancelled) setCountries(list);
            } catch (e) {
                if (!cancelled) setCountries([]);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // Fetch states when country is selected
    useEffect(() => {
        if (!selectedCountry) {
            setStates([]);
            setSelectedState(null);
            return;
        }
        const code = selectedCountry.iso2 || selectedCountry.isoCode;
        if (!code) {
            setStates([]);
            return;
        }
        let cancelled = false;
        import('../services/location').then((locationService) => {
            locationService.getStates(code)
                .then((res) => { if (!cancelled) setStates(normalizeLocationList(res)); })
                .catch(() => { if (!cancelled) setStates([]); });
        });
        return () => { cancelled = true; };
    }, [selectedCountry]);

    // Fetch creators from API
    useEffect(() => {
        fetchCreators();
    }, [selectedCategory, selectedLocation, selectedCountry, selectedState]);

    const fetchCreators = async (pageNum = 1, append = false, searchQuery = searchText) => {
        try {
            setLoading(true);
            const userService = await import('../services/user');

            const params = {
                page: pageNum,
                limit: 20,
                sortBy: 'createdAt',
                sortOrder: 'asc',
            };

            // Add category filter if not 'All'
            const apiCategory = mapUIToCategory(selectedCategory);
            if (apiCategory) {
                params.category = apiCategory;
            }

            // Location filter: use country/state from API dropdowns, or legacy selectedLocation string
            if (selectedCountry) {
                params.country = selectedCountry.name || selectedCountry;
                if (selectedState) {
                    params.state = selectedState.name || selectedState;
                }
            } else if (selectedLocation && selectedLocation !== 'All') {
                const parts = selectedLocation.split(', ').map(p => p.trim());
                const second = parts[1] || '';
                if (second === 'NG') {
                    params.country = 'Nigeria';
                    if (parts[0]) params.state = parts[0];
                } else if (second === 'USA' || second === 'US') {
                    params.country = 'United States';
                    if (parts[0]) params.state = parts[0];
                } else {
                    if (parts[0]) params.state = parts[0];
                    if (parts[1]) params.country = parts[1];
                }
            }

            // Add search query if provided
            if (searchQuery && searchQuery.trim()) {
                params.search = searchQuery.trim();
            }

            const response = await userService.getCreators(params);

            // Handle response: backend returns { success, data: { creators, pagination } }
            const data = response?.data ?? response;
            const creatorsData = Array.isArray(data?.creators) ? data.creators : [];
            const pagination = data?.pagination || {};

            if (response && (response.success !== false) && (creatorsData.length > 0 || !append)) {
                // Transform API data to UI format (backend returns: id, name, avatar, location, categories, totalFollowers, totalEngagementRate, platformReach, rating)
                const transformedCreators = creatorsData.map(creator => {
                    const platformReach = Array.isArray(creator.platformReach) ? creator.platformReach : [];
                    const primaryPlatform = platformReach[0] || {};

                    // Follower count: check totalFollowers, followersCount, and sum platformReach (Robust)
                    let totalFollowers = Number(creator.totalFollowers) || Number(creator.followersCount) || 0;
                    if (totalFollowers === 0 && platformReach.length > 0) {
                        platformReach.forEach(p => {
                            const n = Number(p.followers || p.followerCount || p.count);
                            if (!isNaN(n)) totalFollowers += n;
                        });
                    }

                    const followersDisplay = totalFollowers >= 1000000
                        ? `${(totalFollowers / 1000000).toFixed(1)}M`
                        : totalFollowers >= 1000
                            ? `${(totalFollowers / 1000).toFixed(0)}K`
                            : String(totalFollowers);

                    // Engagement: Match CreatorProfile robust logic
                    let engagementDisplay = '0%';
                    let engagementValue = Number(creator.totalEngagementRate) || Number(creator.engagementRate) || Number(creator.avgEngagementRate) || Number(creator.engagement) || 0;

                    if (engagementValue > 0) {
                        // Normalize 0-1 to 0-100
                        if (engagementValue <= 1) engagementValue = engagementValue * 100;
                        engagementDisplay = `${engagementValue.toFixed(1)}%`;
                    } else if (platformReach.length > 0) {
                        // Average from platforms
                        const rates = platformReach.map(p => Number(p.engagementRate || p.rate || 0)).filter(r => r > 0);
                        if (rates.length > 0) {
                            let avg = rates.reduce((a, b) => a + b, 0) / rates.length;
                            if (avg > 0 && avg <= 1) avg = avg * 100;
                            engagementDisplay = `${avg.toFixed(1)}%`;
                        }
                    }

                    const loc = creator.location && typeof creator.location === 'object' ? creator.location : {};
                    const city = loc.city && String(loc.city).trim() && loc.city !== 'N/A' ? String(loc.city).trim() : '';
                    const state = loc.state && String(loc.state).trim() && loc.state !== 'N/A' ? String(loc.state).trim() : '';
                    const country = loc.country && String(loc.country).trim() && loc.country !== 'N/A' ? String(loc.country).trim() : '';

                    let locationDisplay = 'Worldwide';
                    if (city && state) locationDisplay = `${city}, ${state}`;
                    else if (city && country) locationDisplay = `${city}, ${country}`;
                    else if (city || state || country) locationDisplay = city || state || country;

                    const rawTags = creator.tags || creator.categories || [];
                    const tags = Array.isArray(rawTags) ? rawTags.slice(0, 3) : [];
                    const primaryCategory = (creator.categories && creator.categories[0]) || (tags[0]) || 'General';

                    const email = creator.email || creator.userEmail || (creator.user && creator.user.email) || null;

                    const socialStats = {};
                    platformReach.forEach(platform => {
                        if (platform && platform.platform && (platform.followers != null)) {
                            const n = Number(platform.followers);
                            socialStats[platform.platform] = n >= 1000 ? `${(n / 1000).toFixed(0)}K` : String(n);
                        }
                    });

                    const ratingNum = Number(creator.rating ?? creator.averageRating) || 0;

                    return {
                        id: creator.id || creator._id,
                        name: creator.name || 'Unknown',
                        username: creator.username ? `@${creator.username}` : `@${(creator.name || 'creator').toLowerCase().replace(/\s+/g, '_')}`,
                        email: email || 'Email not available',
                        location: locationDisplay,
                        image: creator.profileImage || creator.avatar || null,
                        tags,
                        category: mapCategoryToUI(primaryCategory),
                        followers: followersDisplay,
                        followersCount: totalFollowers,
                        engagement: engagementDisplay,
                        ratingValue: ratingNum,
                        rating: ratingNum ? ratingNum.toFixed(1) : '5.0',
                        socialStats,
                        _original: creator,
                    };
                });

                if (append) {
                    setAllCreators(prev => [...prev, ...transformedCreators]);
                } else {
                    setAllCreators(transformedCreators);
                }

                setHasMore(pagination.hasNextPage || false);
                setPage(pageNum);
            } else {
                if (!append) {
                    setAllCreators([]);
                }
                setHasMore(false);
            }
        } catch (error) {
            console.error('Failed to fetch creators:', error);
            Alert.alert('Error', 'Failed to load creators. Please try again.');
            if (!append) {
                setAllCreators([]);
            }
        } finally {
            setLoading(false);
        }
    };

    const loadMore = () => {
        if (!loading && hasMore) {
            fetchCreators(page + 1, true);
        }
    };

    // Debounced search effect
    useEffect(() => {
        const searchTimer = setTimeout(() => {
            setPage(1);
            setAllCreators([]);
            fetchCreators(1, false, searchText);
        }, 500);

        return () => clearTimeout(searchTimer);
    }, [searchText]);

    const handleBack = () => {
        navigation?.goBack();
    };

    const handleSearch = (text) => {
        setSearchText(text);
    };

    const handleCategorySelect = (category) => {
        setSelectedCategory(category);
        setPage(1);
        setAllCreators([]);
    };

    const clearLocation = () => {
        setSelectedCountry(null);
        setSelectedState(null);
        setSelectedLocation('All');
        setLocationDropdownOpen(null);
        setPage(1);
        setAllCreators([]);
    };

    const handleCountrySelect = (c) => {
        setSelectedCountry(c);
        setSelectedState(null);
        setLocationDropdownOpen(null);
        setPage(1);
        setAllCreators([]);
    };

    const handleStateSelect = (s) => {
        setSelectedState(s);
        setLocationDropdownOpen(null);
        setPage(1);
        setAllCreators([]);
    };

    const locationSummary = selectedCountry
        ? (selectedState ? `${selectedCountry.name}, ${selectedState.name}` : selectedCountry.name)
        : 'Anywhere';


    const handleViewProfile = (creator) => {
        const userId = creator._original?.id || creator._original?._id || creator.id;
        navigation?.navigate('CreatorProfile', { userId });
    };

    // Filter creators based on search (API handles category filtering, but we do local search too)
    const filteredCreators = allCreators.filter(creator => {
        if (!searchText) return true;
        const searchLower = searchText.toLowerCase();
        const name = (creator.name || '').toLowerCase();
        const email = (creator.email || '').toLowerCase();
        const tags = creator.tags || [];
        return name.includes(searchLower) ||
            email.includes(searchLower) ||
            tags.some(tag => String(tag).toLowerCase().includes(searchLower));
    });

    const renderCreator = ({ item }) => {
        // Helper to get initials for fallback avatar - use first and last name
        const getInitials = (name) => {
            if (!name) return '?';
            const parts = name.trim().split(' ').filter(p => p.length > 0);
            if (parts.length >= 2) {
                return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
            }
            return name.substring(0, 2).toUpperCase();
        };

        return (
            <View style={styles.creatorCard}>
                <View style={styles.creatorHeader}>
                    <View style={styles.creatorProfile}>
                        {item.image ? (
                            <Image source={{ uri: item.image }} style={styles.creatorImage} />
                        ) : (
                            <View style={[styles.creatorImage, styles.creatorImagePlaceholder]}>
                                <Text style={styles.creatorImageInitials}>
                                    {getInitials(item.name)}
                                </Text>
                            </View>
                        )}
                        <View style={styles.creatorInfo}>
                            <Text style={styles.creatorName}>{item.name}</Text>
                            <Text style={styles.creatorUsername}>{item.username}</Text>
                            <View style={styles.creatorLocation}>
                                <MaterialIcons name="location-on" size={14} color="#6b7280" />
                                <Text style={styles.creatorLocationText}>{item.location}</Text>
                            </View>
                        </View>
                    </View>

                </View>

                <View style={styles.creatorTags}>
                    {(item.tags || []).map((tag, index) => {
                        const tagColors = ['#fce7f3', '#f3e8ff', '#dcfce7'];
                        return (
                            <View key={index} style={[styles.creatorTag, { backgroundColor: tagColors[index % tagColors.length] }]}>
                                <Text style={styles.creatorTagText}>{String(tag)}</Text>
                            </View>
                        );
                    })}
                </View>

                <View style={styles.creatorStats}>
                    <View style={styles.creatorStatItem}>
                        <Text style={styles.creatorStatValue}>{item.followers}</Text>
                        <Text style={styles.creatorStatLabel}>Followers</Text>
                    </View>
                    <View style={styles.creatorStatItem}>
                        <Text style={styles.creatorStatValue}>{item.engagement}</Text>
                        <Text style={styles.creatorStatLabel}>Engagement</Text>
                    </View>
                    <View style={styles.creatorStatItem}>
                        <Text style={styles.creatorStatValue}>{item.rating}</Text>
                        <Text style={styles.creatorStatLabel}>Rating</Text>
                    </View>
                </View>

                <View style={styles.creatorFooter}>
                    <View style={styles.socialStatsRow}>
                        {Object.entries(item.socialStats || {}).slice(0, 3).map(([platform, count]) => (
                            <View key={platform} style={styles.socialStatItemMini}>
                                <PlatformIcon
                                    platform={platform}
                                    size={16}
                                    color={platform === 'instagram' ? '#E4405F' : platform === 'tiktok' ? '#000000' : platform === 'youtube' ? '#FF0000' : '#6b7280'}
                                />
                                <Text style={styles.socialStatTextMini}>{count}</Text>
                            </View>
                        ))}
                    </View>

                    <TouchableOpacity
                        style={styles.viewProfileButtonSmall}
                        onPress={() => handleViewProfile(item)}
                    >
                        <Text style={styles.viewProfileButtonTextSmall}>View Profile</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={handleBack}>
                    <MaterialIcons name="arrow-back" size={24} color="#374151" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>All Creators</Text>
                <View style={styles.headerRight} />
            </View>

            {/* Search Bar */}
            <View style={styles.searchSection}>
                <View style={styles.searchContainer}>
                    <MaterialIcons name="search" size={20} color="#6b7280" />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search creators..."
                        placeholderTextColor="#9ca3af"
                        value={searchText}
                        onChangeText={handleSearch}
                        returnKeyType="search"
                    />
                    {searchText.length > 0 && (
                        <TouchableOpacity onPress={() => handleSearch('')}>
                            <MaterialIcons name="close" size={20} color="#6b7280" />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* Filters - collapsible */}
            <View style={styles.filtersSection}>
                <TouchableOpacity style={styles.filterToggleRow} onPress={() => setFilterExpanded(prev => !prev)} activeOpacity={0.7}>
                    <Text style={styles.filterToggleLabel}>Filters</Text>
                    <View style={styles.filterToggleRight}>
                        {!filterExpanded && (
                            <Text style={styles.filterToggleSummary} numberOfLines={1}>
                                {selectedCategory} · {locationSummary}
                            </Text>
                        )}
                        <MaterialIcons
                            name={filterExpanded ? 'expand-less' : 'expand-more'}
                            size={24}
                            color="#6b7280"
                        />
                    </View>
                </TouchableOpacity>
                {filterExpanded && (
                    <>
                        <Text style={styles.filterRowLabel}>Category</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScrollRow} contentContainerStyle={styles.filterChipsContent}>
                            {categories.map((category) => (
                                <TouchableOpacity
                                    key={category}
                                    style={[styles.filterChip, selectedCategory === category && styles.filterChipSelected]}
                                    onPress={() => handleCategorySelect(category)}
                                >
                                    <Text style={[styles.filterChipText, selectedCategory === category && styles.filterChipTextSelected]}>
                                        {category}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                        <Text style={styles.filterRowLabel}>Location</Text>
                        <View style={styles.locationRow}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScrollRow} contentContainerStyle={styles.filterChipsContent}>
                                <TouchableOpacity
                                    style={[styles.filterChip, !selectedCountry && styles.filterChipSelected]}
                                    onPress={clearLocation}
                                >
                                    <Text style={[styles.filterChipText, !selectedCountry && styles.filterChipTextSelected]}>Anywhere</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.filterChip, selectedCountry && styles.filterChipSelected]}
                                    onPress={() => setLocationDropdownOpen(prev => prev === 'country' ? null : 'country')}
                                >
                                    <Text style={[styles.filterChipText, selectedCountry && styles.filterChipTextSelected]} numberOfLines={1}>
                                        {selectedCountry ? selectedCountry.name : 'Country'}
                                    </Text>
                                    <MaterialIcons name="arrow-drop-down" size={18} color={selectedCountry ? '#fff' : '#6b7280'} />
                                </TouchableOpacity>
                                {selectedCountry && states.length > 0 && (
                                    <TouchableOpacity
                                        style={[styles.filterChip, selectedState && styles.filterChipSelected]}
                                        onPress={() => setLocationDropdownOpen(prev => prev === 'state' ? null : 'state')}
                                    >
                                        <Text style={[styles.filterChipText, selectedState && styles.filterChipTextSelected]} numberOfLines={1}>
                                            {selectedState ? selectedState.name : 'State'}
                                        </Text>
                                        <MaterialIcons name="arrow-drop-down" size={18} color={selectedState ? '#fff' : '#6b7280'} />
                                    </TouchableOpacity>
                                )}
                            </ScrollView>
                            {locationDropdownOpen === 'country' && (
                                <ScrollView style={styles.locationDropdownScroll} nestedScrollEnabled>
                                    {countries.length === 0 && <Text style={styles.dropdownLoading}>Loading countries…</Text>}
                                    {countries.map((c, i) => {
                                        const key = c.iso2 || c.id || c.name || i;
                                        const name = (c && c.name) || c;
                                        const isSelected = selectedCountry && (selectedCountry.iso2 === c.iso2 || selectedCountry.id === c.id || selectedCountry.name === name);
                                        return (
                                            <TouchableOpacity key={key} style={[styles.locationDropdownItem, isSelected && styles.locationDropdownItemSelected]} onPress={() => handleCountrySelect(c)}>
                                                <Text style={[styles.locationDropdownItemText, isSelected && styles.locationDropdownItemTextSelected]}>{name}</Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </ScrollView>
                            )}
                            {locationDropdownOpen === 'state' && (
                                <ScrollView style={styles.locationDropdownScroll} nestedScrollEnabled>
                                    {states.length === 0 && <Text style={styles.dropdownLoading}>Loading states…</Text>}
                                    {states.map((s, i) => {
                                        const key = s.iso2 || s.id || s.name || i;
                                        const name = (s && s.name) || s;
                                        const isSelected = selectedState && (selectedState.iso2 === s.iso2 || selectedState.id === s.id || selectedState.name === name);
                                        return (
                                            <TouchableOpacity key={key} style={[styles.locationDropdownItem, isSelected && styles.locationDropdownItemSelected]} onPress={() => handleStateSelect(s)}>
                                                <Text style={[styles.locationDropdownItemText, isSelected && styles.locationDropdownItemTextSelected]}>{name}</Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </ScrollView>
                            )}
                        </View>
                    </>
                )}
            </View>

            {/* Results Count */}
            <View style={styles.resultsSection}>
                <Text style={styles.resultsText}>
                    {filteredCreators.length} {filteredCreators.length === 1 ? 'Creator' : 'Creators'} Found
                </Text>
            </View>

            {/* Creators List */}
            {loading && allCreators.length === 0 ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#337DEB" />
                    <Text style={styles.loadingText}>Loading creators...</Text>
                </View>
            ) : filteredCreators.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <MaterialIcons name="people-outline" size={64} color="#9ca3af" />
                    <Text style={styles.emptyText}>No creators found</Text>
                    <Text style={styles.emptySubtext}>Try adjusting your filters</Text>
                </View>
            ) : (
                <FlatList
                    data={filteredCreators}
                    renderItem={renderCreator}
                    keyExtractor={(item) => item.id?.toString() || item._original?._id || item._original?.id || Math.random().toString()}
                    contentContainerStyle={styles.creatorsList}
                    showsVerticalScrollIndicator={false}
                    onEndReached={loadMore}
                    onEndReachedThreshold={0.5}
                    ListFooterComponent={
                        loading && allCreators.length > 0 ? (
                            <View style={styles.footerLoader}>
                                <ActivityIndicator size="small" color="#337DEB" />
                            </View>
                        ) : null
                    }
                />
            )}
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8fafc',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 20,
        paddingTop: 50,
        paddingBottom: 16,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
        position: 'relative',
    },
    backButton: {
        padding: 8,
        position: 'absolute',
        left: 20,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#374151',
    },
    headerRight: {
        width: 40,
    },
    searchSection: {
        paddingHorizontal: 16,
        paddingVertical: 16,
        backgroundColor: '#fff',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f3f4f6',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 12,
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
        color: '#1f2937',
    },
    filtersSection: {
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 12,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
    },
    filterToggleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 8,
        marginBottom: 4,
    },
    filterToggleLabel: {
        fontSize: 16,
        fontWeight: '600',
        color: '#374151',
    },
    filterToggleRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    filterToggleSummary: {
        fontSize: 13,
        color: '#6b7280',
        maxWidth: 180,
    },
    filterRowLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#374151',
        marginBottom: 8,
    },
    filterScrollRow: {
        marginBottom: 12,
    },
    filterChipsContent: {
        paddingVertical: 8,
        paddingRight: 16,
        flexDirection: 'row',
        gap: 8,
    },
    filterChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#f3f4f6',
        marginRight: 8,
    },
    filterChipSelected: {
        backgroundColor: '#337DEB',
    },
    filterChipText: {
        fontSize: 14,
        color: '#6b7280',
        fontWeight: '500',
    },
    filterChipTextSelected: {
        color: '#ffffff',
    },
    locationRow: {
        marginBottom: 12,
    },
    locationDropdownScroll: {
        maxHeight: 160,
        marginTop: 4,
        marginHorizontal: 4,
        backgroundColor: '#fff',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#e5e7eb',
    },
    dropdownLoading: {
        fontSize: 13,
        color: '#6b7280',
        padding: 12,
    },
    locationDropdownItem: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
    },
    locationDropdownItemSelected: {
        backgroundColor: '#eef2ff',
    },
    locationDropdownItemText: {
        fontSize: 14,
        color: '#374151',
    },
    locationDropdownItemTextSelected: {
        color: '#337DEB',
        fontWeight: '600',
    },
    resultsSection: {
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    resultsText: {
        fontSize: 14,
        color: '#6b7280',
        fontWeight: '500',
    },
    creatorsList: {
        paddingHorizontal: 16,
        paddingBottom: 20,
    },
    creatorCard: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 3,
    },
    creatorHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    creatorProfile: {
        flexDirection: 'row',
        flex: 1,
    },
    creatorImage: {
        width: 64,
        height: 64,
        borderRadius: 12,
        marginRight: 16,
    },
    creatorImagePlaceholder: {
        width: 64,
        height: 64,
        borderRadius: 12,
        backgroundColor: '#337DEB',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    creatorImageInitials: {
        color: '#ffffff',
        fontSize: 22,
        fontWeight: 'bold',
    },
    creatorInfo: {
        flex: 1,
    },
    creatorName: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1f2937',
        marginBottom: 2,
    },
    creatorUsername: {
        fontSize: 14,
        color: '#9ca3af',
        marginBottom: 4,
    },
    bookmarkButtonMini: {
        padding: 10,
        backgroundColor: '#f8fafc',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    creatorLocation: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    creatorLocationText: {
        fontSize: 12,
        color: '#6b7280',
    },

    creatorTags: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: 12,
        marginBottom: 20,
        gap: 8,
    },
    creatorTag: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 16,
    },
    creatorTagText: {
        fontSize: 12,
        color: '#374151',
        fontWeight: '600',
    },
    creatorStats: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 10,
        marginBottom: 20,
    },
    creatorStatItem: {
        alignItems: 'center',
    },
    creatorStatValue: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1f2937',
        marginBottom: 4,
    },
    creatorStatLabel: {
        fontSize: 12,
        color: '#6b7280',
    },
    creatorFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: '#f1f5f9',
        paddingTop: 16,
    },
    socialStatsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    socialStatItemMini: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    socialStatTextMini: {
        fontSize: 12,
        color: '#6b7280',
        fontWeight: '600',
    },
    viewProfileButtonSmall: {
        backgroundColor: '#337DEB',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 12,
        shadowColor: '#337DEB',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    viewProfileButtonTextSmall: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: '700',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 60,
    },
    loadingText: {
        marginTop: 16,
        fontSize: 16,
        color: '#6b7280',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 60,
    },
    emptyText: {
        marginTop: 16,
        fontSize: 18,
        fontWeight: '600',
        color: '#374151',
    },
    emptySubtext: {
        marginTop: 8,
        fontSize: 14,
        color: '#6b7280',
    },
    footerLoader: {
        paddingVertical: 20,
        alignItems: 'center',
    },
});

export default CreatorsList;
